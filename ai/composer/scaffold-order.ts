import type { ParsedScaffoldFile } from './scaffold-parser';

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

function basename(filePath: string): string {
  const parts = normalizePath(filePath).split('/');
  return parts[parts.length - 1] ?? filePath;
}

function pathDepth(filePath: string): number {
  return normalizePath(filePath).split('/').filter(Boolean).length;
}

const ROOT_MANIFESTS = new Set([
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  '.gitignore',
  '.env.example',
]);

const ENTRY_BASENAMES = new Set([
  'main.tsx',
  'main.ts',
  'main.jsx',
  'main.js',
  'index.ts',
  'index.tsx',
  'index.js',
  'main.py',
]);

/** Lower tier = written first (configs/types before components/entry). */
export function getScaffoldFileTier(filePath: string): number {
  const norm = normalizePath(filePath);
  const base = basename(norm);
  const lower = norm.toLowerCase();

  if (ROOT_MANIFESTS.has(base)) return 1;

  if (
    base.startsWith('tsconfig') ||
    base.startsWith('vite.config') ||
    base === 'Dockerfile' ||
    lower.includes('.github/workflows/')
  ) {
    return 2;
  }

  if (base === 'types.ts' || base.startsWith('schemas.') || /\/proto\//i.test(norm)) {
    return 3;
  }

  if (/\/(lib|utils|services)\//i.test(norm)) return 4;

  if (/\/(api|server|routes)\//i.test(norm)) return 5;

  if (/\/(components|hooks)\//i.test(norm)) return 6;

  if (
    base === 'App.tsx' ||
    base === 'App.jsx' ||
    /\/(layouts?|routers?|screens?|pages?)\//i.test(norm)
  ) {
    return 7;
  }

  if (ENTRY_BASENAMES.has(base)) return 8;

  if (/\.test\./i.test(base) || /^tests\//i.test(norm) || /\/tests\//i.test(norm)) {
    return 9;
  }

  if (base === 'README.md' || lower.startsWith('docs/') || /\/docs\//i.test(norm)) {
    return 10;
  }

  return 7;
}

function compareScaffoldFiles(a: ParsedScaffoldFile, b: ParsedScaffoldFile): number {
  const tierA = getScaffoldFileTier(a.path);
  const tierB = getScaffoldFileTier(b.path);
  if (tierA !== tierB) return tierA - tierB;

  const depthA = pathDepth(a.path);
  const depthB = pathDepth(b.path);
  if (depthA !== depthB) return depthA - depthB;

  return normalizePath(a.path).localeCompare(normalizePath(b.path));
}

/** Canonical write order: manifests → configs → types → api → UI → app shell → entry → tests → docs. */
export function sortScaffoldFiles(files: ParsedScaffoldFile[]): ParsedScaffoldFile[] {
  return [...files].sort(compareScaffoldFiles);
}
