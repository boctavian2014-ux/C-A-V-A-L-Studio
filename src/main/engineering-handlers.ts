import * as fs from 'fs';
import * as path from 'path';
import { ipcMain, dialog, shell } from 'electron';

// ──────────────────────────────────────────────
//  Engineering AI — IPC Handlers (Caval IDE)
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

export function sanitizeFileName(name: string): string {
  const base = (name || 'fisier').trim();
  return base.replace(/[^a-z0-9.\-_]/gi, '_').slice(0, 80) || 'fisier';
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
        const dest = path.join(dir, sanitizeFileName(file.name));
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
          const dest = path.join(dir, sanitizeFileName(f.name));
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
      if (!Array.isArray(parts) || parts.length === 0) {
        return { ok: false, error: 'Lista de componente este goală.' };
      }

      const currency = parts[0]?.currency || 'RON';
      let total = 0;

      const lines: string[] = [];
      lines.push('# Listă de componente — Caval Engineering AI');
      lines.push('');
      lines.push('| Componentă | Cant. | Preț/buc | Subtotal | Magazin | Alternativă |');
      lines.push('|---|---|---|---|---|---|');
      for (const p of parts) {
        const subtotal = p.qty * p.unitPrice;
        total += subtotal;
        lines.push(
          `| ${p.name} | ${p.qty} | ${p.unitPrice.toFixed(2)} ${p.currency} | ` +
          `${subtotal.toFixed(2)} ${p.currency} | [${p.shop}](${p.shopUrl}) | ${p.substitute ?? '—'} |`
        );
      }
      lines.push('');
      lines.push(`**Total estimat: ${total.toFixed(2)} ${currency}**`);
      lines.push('');
      const content = lines.join('\n');

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
    async (_e, url: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        if (!/^https?:\/\//i.test(url)) {
          return { ok: false, error: 'URL invalid.' };
        }
        await shell.openExternal(url);
        return { ok: true };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : 'Nu am putut deschide linkul.' };
      }
    }
  );
}
