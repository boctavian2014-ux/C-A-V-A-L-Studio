import type { ComposerDiagnostic } from './types';

export interface ImportIssue {
  file: string;
  importPath: string;
  message: string;
}

export interface WorkspaceVerifySnapshot {
  ran: boolean;
  summary: string;
  commands: Array<{ command: string; ok: boolean; output: string }>;
}

export interface ConsistencyScanResult {
  ok: boolean;
  syntax: ComposerDiagnostic[];
  importIssues: ImportIssue[];
  verify?: WorkspaceVerifySnapshot;
  summary: string;
}

export interface ConsistencyScanOptions {
  projectPath: string;
  writtenFiles: string[];
  readFileContent?: (absPath: string) => Promise<string | null>;
  workspaceVerify?: (root: string) => Promise<{
    ok: boolean;
    verify?: WorkspaceVerifySnapshot & {
      commands: Array<{ command: string; ok: boolean; exitCode: number | null; output: string }>;
    };
    error?: string;
  }>;
  fileExists?: (absPath: string) => boolean;
}

const IMPORT_FROM = /(?:import\s+(?:[\s\S]*?)\s+from\s+|require\s*\(\s*)['"]([^'"]+)['"]/g;

const RESOLVE_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];

function normalizeSlash(p: string): string {
  return p.replace(/\\/g, '/');
}

function joinPath(...parts: string[]): string {
  return normalizeSlash(parts.filter(Boolean).join('/')).replace(/\/+/g, '/');
}

function pathDirname(p: string): string {
  const n = normalizeSlash(p);
  const i = n.lastIndexOf('/');
  return i <= 0 ? n : n.slice(0, i);
}

function pathResolve(from: string, rel: string): string {
  const baseParts = normalizeSlash(from).split('/').filter(Boolean);
  for (const part of rel.split(/[/\\]/)) {
    if (part === '.' || part === '') continue;
    if (part === '..') baseParts.pop();
    else baseParts.push(part);
  }
  return baseParts.join('/');
}

export function collectImportIssues(
  projectPath: string,
  files: Array<{ path: string; content: string }>,
  fileExists: (absPath: string) => boolean = () => false
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  for (const file of files) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file.path)) continue;
    let match: RegExpExecArray | null;
    const re = new RegExp(IMPORT_FROM.source, 'g');
    while ((match = re.exec(file.content)) !== null) {
      const importPath = match[1]!;
      if (!importPath.startsWith('.')) continue;
      const fileDir = pathDirname(joinPath(projectPath, file.path));
      const base = pathResolve(fileDir, importPath);
      let found = false;
      for (const ext of RESOLVE_EXTENSIONS) {
        if (fileExists(base + ext)) {
          found = true;
          break;
        }
      }
      if (!found) {
        issues.push({
          file: file.path,
          importPath,
          message: `Unresolved relative import: ${importPath}`,
        });
      }
    }
  }
  return issues;
}

function buildSummary(
  writtenCount: number,
  syntax: ComposerDiagnostic[],
  importIssues: ImportIssue[],
  verify?: WorkspaceVerifySnapshot
): string {
  if (syntax.length > 0) {
    const first = syntax[0]!;
    return `✗ ${writtenCount} fișier(e) · syntax error în ${first.file ?? '?'}: ${first.message.slice(0, 80)}`;
  }
  if (importIssues.length > 0) {
    const first = importIssues[0]!;
    return `✗ ${writtenCount} fișier(e) · import lipsă în ${first.file}: ${first.importPath}`;
  }
  const failed = verify?.commands?.find((c) => !c.ok);
  if (failed) {
    return `✗ ${writtenCount} fișier(e) · verificare eșuată: ${failed.command}`;
  }
  if (verify?.ran) {
    return `✓ ${writtenCount} fișier(e) · ${verify.summary}`;
  }
  return `✓ ${writtenCount} fișier(e) · consistency OK`;
}

export async function runCavaloConsistencyScan(
  opts: ConsistencyScanOptions
): Promise<ConsistencyScanResult> {
  const readFile = opts.readFileContent ?? (async () => null);
  const fileExists = opts.fileExists ?? (() => false);
  const { SyntaxChecker } = await import('./validation/syntax-checker');
  const syntaxChecker = new SyntaxChecker();

  const fileContents: Array<{ path: string; content: string }> = [];
  for (const rel of opts.writtenFiles) {
    const abs = joinPath(opts.projectPath, rel.replace(/\\/g, '/'));
    const content = await readFile(abs);
    if (content != null) {
      fileContents.push({ path: rel.replace(/\\/g, '/'), content });
    }
  }

  const syntax = await syntaxChecker.check(fileContents);
  const importIssues = collectImportIssues(opts.projectPath, fileContents, fileExists);

  let verify: WorkspaceVerifySnapshot | undefined;
  if (opts.workspaceVerify) {
    const res = await opts.workspaceVerify(opts.projectPath);
    if (res.ok && res.verify) {
      verify = {
        ran: res.verify.ran,
        summary: res.verify.summary,
        commands: res.verify.commands.map((c) => ({
          command: c.command,
          ok: c.ok,
          output: c.output,
        })),
      };
    }
  }

  const ok =
    syntax.length === 0 &&
    importIssues.length === 0 &&
    (!verify?.ran || verify.commands.every((c) => c.ok));

  const summary = buildSummary(opts.writtenFiles.length, syntax, importIssues, verify);

  return { ok, syntax, importIssues, verify, summary };
}
