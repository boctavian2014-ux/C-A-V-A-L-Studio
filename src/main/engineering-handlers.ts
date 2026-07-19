import * as fs from 'fs';
import * as path from 'path';
import { ipcMain, dialog } from 'electron';
import { assertTrustedSender, isSafeExternalUrl, openSafeExternalUrl } from './ipc-trust';

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
  error?: string;
}

const OUTPUT_DIR = 'caval-engineering';

/** Escape a value so it cannot break the markdown table layout. */
function mdCell(value: string): string {
  return (value || '—').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

/** Markdown-safe shop cell: link only when shopUrl is a valid http(s) URL. */
function shopCell(shop: string, shopUrl: string): string {
  const url = typeof shopUrl === 'string' ? shopUrl.trim() : '';
  if (!isSafeExternalUrl(url)) return mdCell(shop);
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

/** Defense-in-depth: confirm the resolved destination stays inside `dir`. */
function resolveInsideDir(dir: string, fileName: string): string | null {
  const dest = path.join(dir, sanitizeFileName(fileName));
  if (!isPathInsideWorkspace(dir, dest)) return null;
  return dest;
}

function ensureOutputDir(projectPath: string): string {
  const dir = path.join(projectPath, OUTPUT_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function isPathInsideWorkspace(workspaceRoot: string, targetPath: string): boolean {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(targetPath);
  return resolved === root || resolved.startsWith(root + path.sep);
}

export function registerEngineeringHandlers(getWorkspaceRoot: (senderId: number) => string): void {
  const assertProjectPath = (senderId: number, projectPath: string): EngSaveResult | null => {
    if (!projectPath) {
      return { ok: false, error: 'Niciun proiect deschis. Deschide un folder mai întâi.' };
    }
    const root = getWorkspaceRoot(senderId);
    if (!isPathInsideWorkspace(root, projectPath)) {
      return { ok: false, error: 'Calea proiectului nu aparține workspace-ului deschis.' };
    }
    return null;
  };

  ipcMain.handle(
    'engineering:saveFile',
    async (event, projectPath: string, file: EngFileInput): Promise<EngSaveResult> => {
      const denied = assertProjectPath(event.sender.id, projectPath);
      if (denied) return denied;
      if (!file?.name) {
        return { ok: false, error: 'Fișier invalid.' };
      }
      try {
        const dir = ensureOutputDir(projectPath);
        const dest = resolveInsideDir(dir, file.name);
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

  ipcMain.handle(
    'engineering:saveAll',
    async (event, projectPath: string, files: EngFileInput[]): Promise<EngSaveResult> => {
      const denied = assertProjectPath(event.sender.id, projectPath);
      if (denied) return denied;
      if (!Array.isArray(files) || files.length === 0) {
        return { ok: false, error: 'Nu există fișiere de salvat.' };
      }
      try {
        const dir = ensureOutputDir(projectPath);
        const savedPaths: string[] = [];
        for (const f of files) {
          if (!f?.name) continue;
          const dest = resolveInsideDir(dir, f.name);
          if (!dest) continue;
          fs.writeFileSync(dest, f.content ?? '', 'utf-8');
          savedPaths.push(dest);
        }
        return { ok: true, savedPaths };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : 'Eroare la salvarea fișierelor.' };
      }
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
        if (projectPath) {
          const denied = assertProjectPath(event.sender.id, projectPath);
          if (denied) return denied;
          const dir = ensureOutputDir(projectPath);
          const dest = path.join(dir, 'componente.md');
          fs.writeFileSync(dest, content, 'utf-8');
          return { ok: true, savedPath: dest };
        }

        const result = await dialog.showSaveDialog({
          title: 'Exportă lista de componente',
          defaultPath: 'componente.md',
          filters: [{ name: 'Markdown', extensions: ['md'] }],
        });
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
    async (event, url: string): Promise<{ ok: boolean; error?: string }> => {
      assertTrustedSender(event);
      // shopUrl vine din output LLM — fără allowlist, orice http(s) trecea
      // direct în browser. Validam protocolul și cerem confirmarea explicită
      // a utilizatorului înainte de a deschide un host arbitrar.
      if (!isSafeExternalUrl(url)) {
        return { ok: false, error: 'URL blocat de politica de securitate.' };
      }
      const host = new URL(url).hostname;
      const choice = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Deschide', 'Anulează'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        message: `Deschizi linkul extern ${host}?`,
        detail: url.length > 300 ? `${url.slice(0, 300)}…` : url,
      });
      if (choice.response !== 0) {
        return { ok: false, error: 'Anulat de utilizator.' };
      }
      return openSafeExternalUrl(url);
    }
  );
}
