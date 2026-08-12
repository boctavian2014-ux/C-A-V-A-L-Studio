import * as fs from 'fs';
import * as path from 'path';
import { ipcMain, dialog, BrowserWindow } from 'electron';
import { assertTrustedSender } from './ipc-trust';
import {
  isExternalUrlOrigin,
  isRenderableExternalHref,
  openExternalUrl,
  type ExternalUrlOrigin,
} from './external-url-policy';
import {
  assertBatchFileCount,
  assertTextContentSize,
  resolveInsideDir,
  resolveSandboxedWorkspacePath,
} from './path-security';

// ──────────────────────────────────────────────
//  Robotics AI — IPC Handlers (CAVALLO Studio)
// ──────────────────────────────────────────────

export interface EngFileInput {
  name: string;
  content: string;
}

export interface EngPartInput {
  name: string;
  qty: number;
  unitPrice: number;
  currency: string;
  shop: string;
  shopUrl: string;
  substitute?: string;
}

export interface EngSaveResult {
  ok: boolean;
  savedPath?: string;
  savedPaths?: string[];
  /** Present when validation rejected the batch before any write. */
  validationErrors?: string[];
  /**
   * After validation passed: if a mid-write I/O error occurs we stop immediately
   * (no silent continue) and report which paths wrote vs which failed.
   */
  failed?: Array<{ name: string; error: string }>;
  error?: string;
}

const OUTPUT_DIR = 'caval-engineering';

/** Escape a value so it cannot break the markdown table layout. */
function mdCell(value: string): string {
  return (value || '—').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

/** Markdown-safe shop cell: link only when shopUrl is a valid external href (display only). */
function shopCell(shop: string, shopUrl: string): string {
  const url = typeof shopUrl === 'string' ? shopUrl.trim() : '';
  if (!isRenderableExternalHref(url)) return mdCell(shop);
  const encoded = url.replace(/[()\s]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
  return `[${mdCell(shop)}](${encoded})`;
}

/** Build the componente.md content. Exported for tests. */
export function buildCartMarkdown(parts: EngPartInput[]): string {
  const currency = parts[0]?.currency || 'RON';
  let total = 0;
  const lines: string[] = [];
  lines.push('# Listă de componente — Robotics AI ULTRA');
  lines.push('');
  lines.push('| Componentă | Cant. | Preț/buc | Subtotal | Magazin | Alternativă |');
  lines.push('|---|---|---|---|---|---|');
  for (const p of parts) {
    const subtotal = p.qty * p.unitPrice;
    total += subtotal;
    lines.push(
      `| ${mdCell(p.name)} | ${p.qty} | ${p.unitPrice.toFixed(2)} ${p.currency} | ` +
      `${subtotal.toFixed(2)} ${p.currency} | ${shopCell(p.shop, p.shopUrl)} | ${mdCell(p.substitute ?? '—')} |`
    );
  }
  lines.push('');
  lines.push(`**Total estimat: ${total.toFixed(2)} ${currency}**`);
  lines.push('');
  return lines.join('\n');
}

export function sanitizeFileName(name: string): string {
  const base = (name || 'fisier').trim();
  const cleaned = base.replace(/[^a-z0-9.\-_]/gi, '_').slice(0, 80);
  // Neutralize path-traversal names: '.', '..', or names made only of dots
  // would escape the output directory via path.join(dir, name).
  if (!cleaned || /^\.+$/.test(cleaned)) return 'fisier';
  return cleaned;
}

function ensureOutputDir(workspaceRoot: string): string {
  const dir = path.join(workspaceRoot, OUTPUT_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return fs.realpathSync(dir);
}

export function isPathInsideWorkspace(workspaceRoot: string, targetPath: string): boolean {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(targetPath);
  return resolved === root || resolved.startsWith(root + path.sep);
}

/**
 * Lot A: workspace root exclusively from getBoundWorkspaceRoot — never cwd fallback.
 * Renderer-supplied projectPath is validated as under the bound root (or ignored when equal).
 */
export function registerEngineeringHandlers(
  getBoundWorkspaceRoot: (senderId: number) => string | undefined
): void {
  const boundRootOrError = (
    senderId: number
  ): { root: string } | EngSaveResult => {
    const root = getBoundWorkspaceRoot(senderId)?.trim();
    if (!root) {
      return { ok: false, error: 'Niciun proiect deschis. Deschide un folder mai întâi.' };
    }
    return { root };
  };

  const resolveProjectUnderBound = (
    boundRoot: string,
    projectPath: string | null | undefined
  ): string | EngSaveResult => {
    if (!projectPath?.trim()) {
      return { ok: false, error: 'Niciun proiect deschis. Deschide un folder mai întâi.' };
    }
    try {
      return resolveSandboxedWorkspacePath(boundRoot, projectPath);
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Calea proiectului nu aparține workspace-ului deschis.',
      };
    }
  };

  ipcMain.handle(
    'engineering:saveFile',
    async (event, projectPath: string, file: EngFileInput): Promise<EngSaveResult> => {
      assertTrustedSender(event);
      const bound = boundRootOrError(event.sender.id);
      if (!('root' in bound)) return bound;
      const project = resolveProjectUnderBound(bound.root, projectPath);
      if (typeof project !== 'string') return project;
      if (!file?.name) {
        return { ok: false, error: 'Fișier invalid.' };
      }
      try {
        assertTextContentSize(file.content ?? '', 'engineering file');
        const dir = ensureOutputDir(project);
        const dest = resolveInsideDir(dir, sanitizeFileName(file.name));
        if (!dest) {
          return { ok: false, error: 'Nume de fișier invalid.' };
        }
        fs.writeFileSync(dest, file.content ?? '', 'utf-8');
        return { ok: true, savedPath: dest };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : 'Eroare la salvarea fișierului.' };
      }
    }
  );

  /**
   * saveAll contract (Lot A):
   * 1) Validate ENTIRE file list before any write (names, sandbox paths, sizes, batch count).
   * 2) If any input invalid → write nothing; return validationErrors.
   * 3) Then write sequentially. On mid-write I/O failure: stop immediately, return
   *    savedPaths (succeeded) + failed (which failed) — never continue silently.
   */
  ipcMain.handle(
    'engineering:saveAll',
    async (event, projectPath: string, files: EngFileInput[]): Promise<EngSaveResult> => {
      assertTrustedSender(event);
      const bound = boundRootOrError(event.sender.id);
      if (!('root' in bound)) return bound;
      const project = resolveProjectUnderBound(bound.root, projectPath);
      if (typeof project !== 'string') return project;
      if (!Array.isArray(files) || files.length === 0) {
        return { ok: false, error: 'Nu există fișiere de salvat.' };
      }

      const validationErrors: string[] = [];
      try {
        assertBatchFileCount(files.length);
      } catch (err: unknown) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Batch too large',
          validationErrors: [err instanceof Error ? err.message : 'Batch too large'],
        };
      }

      let dir: string;
      try {
        dir = ensureOutputDir(project);
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : 'Cannot create output dir' };
      }

      const planned: Array<{ name: string; dest: string; content: string }> = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (!f?.name) {
          validationErrors.push(`files[${i}]: missing name`);
          continue;
        }
        try {
          assertTextContentSize(f.content ?? '', `files[${i}]`);
        } catch (err: unknown) {
          validationErrors.push(
            `files[${i}] (${f.name}): ${err instanceof Error ? err.message : String(err)}`
          );
          continue;
        }
        const dest = resolveInsideDir(dir, sanitizeFileName(f.name));
        if (!dest) {
          validationErrors.push(`files[${i}] (${f.name}): invalid file name / path escape`);
          continue;
        }
        planned.push({ name: f.name, dest, content: f.content ?? '' });
      }

      if (validationErrors.length > 0) {
        return {
          ok: false,
          error: 'Validation failed — no files written',
          validationErrors,
        };
      }
      if (planned.length === 0) {
        return { ok: false, error: 'Nu există fișiere de salvat.' };
      }

      const savedPaths: string[] = [];
      const failed: Array<{ name: string; error: string }> = [];
      for (const item of planned) {
        try {
          fs.writeFileSync(item.dest, item.content, 'utf-8');
          savedPaths.push(item.dest);
        } catch (err: unknown) {
          failed.push({
            name: item.name,
            error: err instanceof Error ? err.message : 'I/O write failed',
          });
          // Fail-closed mid-write: stop; do not continue silently.
          return {
            ok: false,
            error: 'I/O failure after validation — partial write',
            savedPaths,
            failed,
          };
        }
      }
      return { ok: true, savedPaths };
    }
  );

  ipcMain.handle(
    'engineering:exportCart',
    async (
      event,
      parts: EngPartInput[],
      projectPath: string | null
    ): Promise<EngSaveResult> => {
      assertTrustedSender(event);
      if (!Array.isArray(parts) || parts.length === 0) {
        return { ok: false, error: 'Lista de componente este goală.' };
      }

      const content = buildCartMarkdown(parts);
      try {
        assertTextContentSize(content, 'cart markdown');
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : 'Content too large' };
      }

      try {
        // In-workspace save only when projectPath is under bound root.
        // Outside workspace: ONLY via native Save dialog — renderer never supplies free external path.
        if (projectPath) {
          const bound = boundRootOrError(event.sender.id);
          if (!('root' in bound)) return bound;
          const project = resolveProjectUnderBound(bound.root, projectPath);
          if (typeof project !== 'string') return project;
          const dir = ensureOutputDir(project);
          const dest = resolveInsideDir(dir, 'componente.md');
          if (!dest) return { ok: false, error: 'Nume de fișier invalid.' };
          fs.writeFileSync(dest, content, 'utf-8');
          return { ok: true, savedPath: dest };
        }

        const window = BrowserWindow.fromWebContents(event.sender);
        const saveOptions = {
          title: 'Exportă lista de componente',
          defaultPath: 'componente.md',
          filters: [{ name: 'Markdown', extensions: ['md'] }],
        };
        const result = window
          ? await dialog.showSaveDialog(window, saveOptions)
          : await dialog.showSaveDialog(saveOptions);
        if (result.canceled || !result.filePath) {
          return { ok: false, error: 'Anulat.' };
        }
        fs.writeFileSync(result.filePath, content, 'utf-8');
        return { ok: true, savedPath: result.filePath };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : 'Eroare la export.' };
      }
    }
  );

  ipcMain.handle(
    'engineering:openExternal',
    async (
      event,
      payload: string | { url: string; origin?: ExternalUrlOrigin }
    ): Promise<{ ok: boolean; error?: string }> => {
      assertTrustedSender(event);
      // Lot C4: renderer/LLM content may only claim EXTERNAL_CONTENT — never bypass via origin spoof.
      const url = typeof payload === 'string' ? payload : payload?.url;
      const claimedOrigin =
        typeof payload === 'object' && payload && isExternalUrlOrigin(payload.origin)
          ? payload.origin
          : 'EXTERNAL_CONTENT';
      if (claimedOrigin !== 'EXTERNAL_CONTENT') {
        return { ok: false, error: 'Origin IPC invalid pentru openExternal.' };
      }
      if (typeof url !== 'string' || !url.trim()) {
        return { ok: false, error: 'URL lipsă.' };
      }
      return openExternalUrl(url, { origin: 'EXTERNAL_CONTENT' });
    }
  );
}
