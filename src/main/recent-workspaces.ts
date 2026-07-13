import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export type RecentWorkspaceSource = 'folder' | 'clone';

export interface RecentWorkspaceEntry {
  path: string;
  name: string;
  lastOpened: string;
  source: RecentWorkspaceSource;
}

const MAX_RECENT = 8;

function recentFilePath(): string {
  return path.join(app.getPath('userData'), 'recent-workspaces.json');
}

function readAll(): RecentWorkspaceEntry[] {
  try {
    const file = recentFilePath();
    if (!fs.existsSync(file)) return [];
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as RecentWorkspaceEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: RecentWorkspaceEntry[]): void {
  fs.writeFileSync(recentFilePath(), JSON.stringify(entries, null, 2), 'utf8');
}

export function listRecentWorkspaces(): RecentWorkspaceEntry[] {
  return readAll()
    .filter((e) => e.path && fs.existsSync(e.path))
    .sort((a, b) => b.lastOpened.localeCompare(a.lastOpened))
    .slice(0, MAX_RECENT);
}

export function addRecentWorkspace(
  folderPath: string,
  source: RecentWorkspaceSource = 'folder'
): RecentWorkspaceEntry[] {
  const normalized = path.resolve(folderPath);
  const name = path.basename(normalized);
  const now = new Date().toISOString();
  const without = readAll().filter((e) => path.resolve(e.path) !== normalized);
  const next: RecentWorkspaceEntry[] = [
    { path: normalized, name, lastOpened: now, source },
    ...without,
  ].slice(0, MAX_RECENT);
  writeAll(next);
  return next;
}

export function removeRecentWorkspace(folderPath: string): RecentWorkspaceEntry[] {
  const normalized = path.resolve(folderPath);
  const next = readAll().filter((e) => path.resolve(e.path) !== normalized);
  writeAll(next);
  return next;
}
