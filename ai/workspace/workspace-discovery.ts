import { isAgenticRepairRequest } from '../prompts/agentic-repair';
import { isArenaContinueRequest } from '../prompts/arena-continue';
import { isDeliveryContinueRequest } from '../prompts/full-delivery-rule';
import { isScaffoldContinueRequest } from '../prompts/scaffold-emission-rule';
import type {
  WorkspaceDiscoverySnapshot,
  WorkspaceDiscoveryScripts,
  WorkspaceLockfileKind,
} from '../../src/shared/workspace-discovery-contract';

export const DISCOVERY_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  '.cavalo',
  '__pycache__',
]);

export const DISCOVERY_SKIP_FILES = new Set(['.env', '.env.local', '.env.production']);

const CONTINUE_WORKSPACE_PATTERNS: RegExp[] = [
  /\b(?:verific[ăa]|check)\s+(?:folderul|directorul|workspace(?:-ul)?|proiectul|project\s+folder)\b/i,
  /\b(?:vezi|see)\s+(?:unde\s+(?:ai\s+)?r[ăa]mas|where\s+(?:you\s+|we\s+)?left\s+off?)\b/i,
  /\bcontinu[ăa]\s+proiectul\b/i,
  /\bcontinue\s+(?:the\s+)?project\b/i,
  /^(?:continu[ăa]|continue)\.?$/i,
  /\bcontinue\s+(?:the\s+)?(?:project|workspace|work)\b/i,
  /\bresume\s+(?:the\s+)?(?:project|workspace)\b/i,
];

/** User intent: inspect active workspace and continue safely — not system *_CONTINUE markers. */
export function isContinueWorkspaceRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (
    isScaffoldContinueRequest(text) ||
    isDeliveryContinueRequest(text) ||
    isAgenticRepairRequest(text) ||
    isArenaContinueRequest(text)
  ) {
    return false;
  }
  return CONTINUE_WORKSPACE_PATTERNS.some((pattern) => pattern.test(text));
}

export function isInspectOnlyWorkspaceRequest(message: string): boolean {
  const text = message.trim();
  return (
    /\b(?:verific[ăa]|check)\s+(?:folderul|directorul|workspace|proiectul)\b/i.test(text) &&
    !/\bcontinu[ăa]\b/i.test(text) &&
    !/\bcontinue\b/i.test(text)
  );
}

export function detectLockfile(rootEntries: string[]): WorkspaceLockfileKind | undefined {
  if (rootEntries.includes('pnpm-lock.yaml')) return 'pnpm';
  if (rootEntries.includes('yarn.lock')) return 'yarn';
  if (rootEntries.includes('package-lock.json')) return 'npm';
  return undefined;
}

export function parsePackageScripts(raw: unknown): WorkspaceDiscoveryScripts {
  if (!raw || typeof raw !== 'object') return {};
  const scripts = (raw as { scripts?: Record<string, string> }).scripts ?? {};
  const pick = (key: string) =>
    typeof scripts[key] === 'string' && scripts[key].trim() ? scripts[key].trim() : undefined;
  return {
    typecheck: pick('typecheck'),
    lint: pick('lint'),
    test: pick('test'),
    build: pick('build'),
    dev: pick('dev') ?? pick('start'),
  };
}

export function inferProjectType(input: {
  scripts: WorkspaceDiscoveryScripts;
  rootEntries: string[];
  keyDirs: string[];
  packageName?: string;
  dependencies?: Record<string, string>;
}): string {
  const deps = input.dependencies ?? {};
  const depNames = Object.keys(deps).join(' ').toLowerCase();
  const parts: string[] = [];

  if (depNames.includes('electron') || input.rootEntries.some((e) => e.startsWith('electron'))) {
    parts.push('Electron');
  }
  if (depNames.includes('vite') || input.rootEntries.includes('vite.config.ts')) {
    parts.push('Vite');
  }
  if (depNames.includes('next') || input.rootEntries.includes('next.config.js')) {
    parts.push('Next.js');
  }
  if (
    input.keyDirs.includes('src') ||
    input.rootEntries.some((e) => e.endsWith('.ts') || e.endsWith('.tsx'))
  ) {
    parts.push('TypeScript');
  } else if (input.rootEntries.some((e) => e.endsWith('.js'))) {
    parts.push('JavaScript');
  }
  if (input.scripts.test) parts.push('tested');
  if (!parts.length) return input.packageName?.trim() ? 'generic project' : 'generic folder';
  return parts.join('/');
}

export function recommendNextStep(snapshot: WorkspaceDiscoverySnapshot): string {
  if (snapshot.verify?.ran && snapshot.verify.allOk === false) {
    return `Rezolv erorile raportate de validare (${snapshot.verify.summary}) înainte de editări noi.`;
  }
  if (snapshot.git?.modifiedCount && snapshot.git.modifiedCount > 0) {
    const sample = snapshot.git.modifiedFiles.slice(0, 3).join(', ');
    return `Revizuiesc modificările necomise (${sample}) și continui de acolo.`;
  }
  if (snapshot.todos.length > 0) {
    const first = snapshot.todos[0];
    return `Continui marcajul ${first.tag} din ${first.file}.`;
  }
  if (snapshot.scripts.typecheck || snapshot.scripts.test || snapshot.scripts.lint) {
    return 'Rulez validarea proiectului (typecheck/lint/test) înainte de editări noi.';
  }
  return 'Propun următorul pas de implementare pe baza structurii detectate.';
}

export function buildWorkspaceDiscoveryUserMessage(snapshot: WorkspaceDiscoverySnapshot): string {
  const lines: string[] = [];
  if (!snapshot.ok) {
    return snapshot.error ?? 'Nu am putut inspecta workspace-ul activ.';
  }

  lines.push(
    `Am verificat folderul activ **${snapshot.projectName}** (${snapshot.projectType}).`
  );

  if (snapshot.hasPackageJson) {
    const scriptBits = [
      snapshot.scripts.typecheck ? 'typecheck' : null,
      snapshot.scripts.lint ? 'lint' : null,
      snapshot.scripts.test ? 'test' : null,
      snapshot.scripts.build ? 'build' : null,
    ].filter(Boolean);
    lines.push(
      scriptBits.length
        ? `Scripts detectate: ${scriptBits.join(', ')}.`
        : 'package.json present, fără scripturi typecheck/lint/test/build standard.'
    );
  } else {
    lines.push('Nu există package.json — proiect generic.');
  }

  if (snapshot.git?.isRepo) {
    const mod = snapshot.git.modifiedCount;
    lines.push(
      mod > 0
        ? `Stare Git: ${mod} fișier(e) modificate pe branch ${snapshot.git.branch ?? 'unknown'}.`
        : `Stare Git: working tree curat pe branch ${snapshot.git.branch ?? 'unknown'}.`
    );
    if (snapshot.git.lastCommit) {
      lines.push(`Ultimul commit: ${snapshot.git.lastCommit}`);
    }
  } else {
    lines.push('Git: repository negăsit în workspace.');
  }

  if (snapshot.todos.length > 0) {
    const t = snapshot.todos[0];
    lines.push(`Marcaj incomplet: ${t.tag} în ${t.file}:${t.line}.`);
  }

  if (snapshot.verify?.ran) {
    lines.push(
      snapshot.verify.allOk
        ? `Validare: ${snapshot.verify.summary} — OK.`
        : `Validare: ${snapshot.verify.summary} — necesită atenție.`
    );
  }

  lines.push(`Următorul pas: ${snapshot.recommendedNextStep}`);
  return lines.join('\n');
}

export function scanTodoMarkers(content: string, max = 5): Array<{ line: number; tag: string; excerpt: string }> {
  const hits: Array<{ line: number; tag: string; excerpt: string }> = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length && hits.length < max; i++) {
    const match = lines[i]?.match(/\b(TODO|FIXME|HACK)\b[:]\s*(.{0,80})/i);
    if (match) {
      hits.push({
        line: i + 1,
        tag: match[1].toUpperCase(),
        excerpt: match[2].trim(),
      });
    }
  }
  return hits;
}
