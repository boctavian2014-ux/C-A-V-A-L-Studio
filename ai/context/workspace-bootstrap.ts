import fs from 'node:fs';
import path from 'node:path';

import {
  WORKSPACE_BOOTSTRAP_MARKER,
  mergeProjectContextWithBootstrap,
} from './workspace-bootstrap-shared';

export { WORKSPACE_BOOTSTRAP_MARKER, mergeProjectContextWithBootstrap };

export const MAX_BOOTSTRAP_CHARS = 12_000;

const IGNORE = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  '__pycache__',
  '.DS_Store',
  'coverage',
  '.turbo',
  '.cache',
  '.cavalo',
]);

const KEY_FILES: Array<{ rel: string; maxChars: number }> = [
  { rel: 'package.json', maxChars: 3_000 },
  { rel: 'README.md', maxChars: 2_500 },
  { rel: 'package-lock.json', maxChars: 1_500 },
  { rel: 'pnpm-lock.yaml', maxChars: 1_500 },
  { rel: 'yarn.lock', maxChars: 1_500 },
  { rel: '.env.example', maxChars: 1_200 },
  { rel: 'docker-compose.yml', maxChars: 1_500 },
  { rel: 'Dockerfile', maxChars: 1_500 },
];

function buildTreeLines(
  dirPath: string,
  rootPath: string,
  lines: string[],
  maxLines: number,
  depth = 0
): void {
  if (depth > 6 || lines.length >= maxLines) return;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const sorted = entries
      .filter((e) => !IGNORE.has(e.name))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    for (const entry of sorted) {
      if (lines.length >= maxLines) return;
      const indent = '  '.repeat(depth);
      const icon = entry.isDirectory() ? '📁' : '📄';
      lines.push(`${indent}${icon} ${entry.name}`);
      if (entry.isDirectory()) {
        buildTreeLines(
          path.join(dirPath, entry.name),
          rootPath,
          lines,
          maxLines,
          depth + 1
        );
      }
    }
  } catch {
    // unreadable dir
  }
}

function readFileSnippet(filePath: string, maxChars: number): string | null {
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.length > maxChars) {
      return `${content.slice(0, maxChars)}\n...(truncat)`;
    }
    return content;
  } catch {
    return null;
  }
}

/** Build workspace bootstrap block from real files on disk (main process). */
export function buildWorkspaceBootstrap(workspaceRoot: string): string {
  const root = workspaceRoot?.trim();
  if (!root) return '';

  const parts: string[] = [WORKSPACE_BOOTSTRAP_MARKER, `Workspace: ${root}`];

  const treeLines: string[] = [];
  buildTreeLines(root, root, treeLines, 55);
  if (treeLines.length > 0) {
    parts.push(`Structură proiect:\n${treeLines.join('\n')}`);
    if (treeLines.length >= 55) parts.push('...(structură trunchiată)');
  }

  for (const { rel, maxChars } of KEY_FILES) {
    const full = path.join(root, rel);
    const snippet = readFileSnippet(full, maxChars);
    if (snippet) {
      parts.push(`--- ${rel} ---\n\`\`\`\n${snippet}\n\`\`\``);
    }
  }

  let result = parts.join('\n\n');
  if (result.length > MAX_BOOTSTRAP_CHARS) {
    result = `${result.slice(0, MAX_BOOTSTRAP_CHARS)}\n...(bootstrap truncat)`;
  }
  return result;
}
