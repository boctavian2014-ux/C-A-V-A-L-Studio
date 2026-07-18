export interface ParsedScaffoldFile {
  path: string;
  content: string;
}

const CODE_FENCE = /```([\w.-]+)?(?::([^\n`]+))?\s*\n([\s\S]*?)```/g;

const LANG_DEFAULT_FILE: Record<string, string> = {
  typescript: 'src/index.ts',
  ts: 'src/index.ts',
  tsx: 'src/index.tsx',
  javascript: 'src/index.js',
  js: 'src/index.js',
  jsx: 'src/index.jsx',
  python: 'src/main.py',
  py: 'src/main.py',
  go: 'main.go',
  rust: 'src/main.rs',
  rs: 'src/main.rs',
  java: 'src/Main.java',
  json: 'package.json',
  bash: 'src/main.sh',
  sh: 'src/main.sh',
  shell: 'src/main.sh',
  zsh: 'src/main.sh',
  html: 'src/index.html',
  htm: 'src/index.html',
  css: 'src/styles.css',
  scss: 'src/styles.scss',
  markdown: 'README.md',
  md: 'README.md',
  yaml: 'config.yaml',
  yml: 'config.yml',
  toml: 'config.toml',
  sql: 'schema.sql',
  cpp: 'src/main.cpp',
  c: 'src/main.c',
  h: 'src/main.h',
  kotlin: 'src/Main.kt',
  kt: 'src/Main.kt',
  swift: 'src/main.swift',
  dart: 'src/main.dart',
  cs: 'src/Program.cs',
  csharp: 'src/Program.cs',
  xml: 'config.xml',
  ini: 'config.ini',
  env: '.env',
  dockerfile: 'Dockerfile',
  docker: 'Dockerfile',
  vue: 'src/App.vue',
  svelte: 'src/App.svelte',
  astro: 'src/pages/index.astro',
};

const INFER_ONLY_LANGS = new Set(['text', 'plaintext', 'txt']);

function indexedPath(base: string, index: number): string {
  if (index === 0) return base;
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  return `${stem}_${index}${ext}`;
}

/** Guess extension from fence body when lang tag is missing or unknown. */
export function inferExtensionFromContent(content: string): string | null {
  const head = content.slice(0, 1200);
  const trimmed = head.trimStart();

  if (/^#!.*\bpython/i.test(trimmed)) return 'py';
  if (/^\s*def \w+\(/m.test(head) || /^\s*class \w+/m.test(head)) return 'py';
  if (/^(from __future__ import|import \w+)/m.test(head)) return 'py';
  if (/^#!.*\b(bash|sh|zsh)\b/i.test(trimmed)) return 'sh';
  if (/^(import .+ from ['"]|export (default )?(async )?(function|class|const|interface)|interface \w+)/m.test(head)) {
    return /<[A-Za-z]/.test(head) ? 'tsx' : 'ts';
  }
  if (/^(const|let|var|function)\s+\w+/m.test(head) || /=>\s*\{/.test(head)) return 'js';
  if (/^package main\b/m.test(head) || /^import ['"]/m.test(head)) return 'go';
  if (/^fn main\b|^use (std|crate)::/m.test(head)) return 'rs';
  if (/^public class \w+|^import java\./m.test(head)) return 'java';
  if (/^<!DOCTYPE|^<html[\s>]/i.test(trimmed)) return 'html';
  if (/^@tailwind|^@import url\(|^\.[\w-]+\s*\{|^@media /m.test(head)) return 'css';
  if (/^\s*\{[\s\S]*"[\w-]+"\s*:/.test(trimmed)) return 'json';
  if (/^---\r?\n[\w-]+:/m.test(head)) return 'yaml';
  if (/^(SELECT|CREATE TABLE|INSERT INTO)\s/im.test(head)) return 'sql';

  return null;
}

function defaultPathForLang(lang: string, index: number, content = ''): string {
  const key = lang.toLowerCase();
  const base = INFER_ONLY_LANGS.has(key) ? undefined : LANG_DEFAULT_FILE[key];
  if (base) return indexedPath(base, index);

  const inferred = inferExtensionFromContent(content);
  if (inferred) {
    const stem = index === 0 ? 'src/main' : `src/file${index}`;
    return `${stem}.${inferred}`;
  }

  return index === 0 ? 'src/main.txt' : `src/file${index}.txt`;
}

const FILE_PATH_RE =
  /^[\w./\\-]+\.(ts|tsx|js|jsx|json|py|go|rs|java|kt|swift|dart|cs|cpp|c|h|ino|yaml|yml|toml|md|mdx|html|htm|css|scss|sass|less|sql|env|sh|gradle|xml|plist|properties|txt|vue|svelte|astro|prisma|graphql|gql|rb|php|ex|exs|erl|hs|lua|r|m|mm|swift|wasm|wast|proto|tf|hcl|lock)$/i;

function normalizeRelativePath(raw: string): string | null {
  const normalized = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\\/g, '/')
    .replace(/^[/\\]+/, '')
    .replace(/^\.\/+/, '');
  if (!normalized || normalized.includes('..')) return null;
  const base = normalized.split('/').pop() ?? normalized;
  if (base === 'Dockerfile' || base === 'Makefile') return normalized;
  if (!FILE_PATH_RE.test(base)) return null;
  return normalized;
}

const FRAGMENT_INTERNAL_MARKERS = [
  /\babortController\b/,
  /\bstreamCleanup\b/,
  /\buseEditorStore\.getState\b/,
  /\bget\(\)\.messages\b/,
  /\bset\(\(s\)\s*=>/,
  /\bapplyUnifiedDiff\b/,
];

import {
  FORBIDDEN_USER_WORKSPACE_PATH_RE,
  FORBIDDEN_USER_PACKAGE_NAMES,
} from '../scaffolds/workspace-forbidden-paths';
import { isFashionDuplicateScaffoldPath, isJunkScaffoldPath } from '../scaffolds/workspace-rules';

/** Paths that collide with built-in CAVALLO modules — never scaffold here. */
const BLOCKED_SCAFFOLD_PATH_RE = FORBIDDEN_USER_WORKSPACE_PATH_RE;

const BLOCKED_SCAFFOLD_PACKAGE_NAMES = FORBIDDEN_USER_PACKAGE_NAMES;

export function isBlockedScaffoldPath(path: string): boolean {
  const normalized = path.trim().replace(/\\/g, '/').replace(/^\.\/+/, '');
  return (
    BLOCKED_SCAFFOLD_PATH_RE.test(normalized) ||
    isJunkScaffoldPath(normalized) ||
    isFashionDuplicateScaffoldPath(normalized)
  );
}

/** Ensure `composer.ts` exports `composer` when sibling `server.ts` imports it. */
export function repairScaffoldComposerExport(path: string, content: string): string {
  const normalized = path.trim().replace(/\\/g, '/');
  if (!normalized.endsWith('/composer.ts') && normalized !== 'composer.ts') return content;
  if (/\bexport\s+const\s+composer\b/.test(content)) return content;

  if (/\bexport\s+const\s+zeroLatencyComposer\b/.test(content)) {
    return `${content.trimEnd()}\n\nexport const composer = zeroLatencyComposer;\n`;
  }

  if (/\bexport\s+class\s+ZeroLatencyComposer\b/.test(content)) {
    const hasInstance = /\bexport\s+const\s+zeroLatencyComposer\b/.test(content);
    const suffix = hasInstance
      ? '\nexport const composer = zeroLatencyComposer;\n'
      : '\nexport const zeroLatencyComposer = new ZeroLatencyComposer();\nexport const composer = zeroLatencyComposer;\n';
    return `${content.trimEnd()}${suffix}`;
  }

  return content;
}

function acceptScaffoldPath(path: string): boolean {
  return !isBlockedScaffoldPath(path);
}

/** Reject IDE/chat snippets that are not standalone modules (prevents junk like src/index.ts). */
export function isScaffoldFragment(content: string): boolean {
  const body = content.trim();
  if (!body) return true;

  if (FRAGMENT_INTERNAL_MARKERS.some((re) => re.test(body))) return true;

  if (/\blet\s+ctx\s*=/.test(body) && /\btab\.path\b/.test(body) && /\breturn\s+ctx\b/.test(body)) {
    return true;
  }

  const hasTopLevelReturn = /(?:^|\n)\s*return\b/.test(body);
  const hasModuleStructure =
    /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\b/m.test(body) ||
    /(?:^|\n)\s*def\s+\w+/m.test(body) ||
    /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/m.test(body) ||
    /(?:^|\n)\s*export\s+/m.test(body) ||
    /(?:^|\n)\s*import\s+/m.test(body) ||
    /(?:^|\n)\s*class\s+\w+/m.test(body);

  if (hasTopLevelReturn && !hasModuleStructure) return true;

  return false;
}

function acceptScaffoldBody(body: string): boolean {
  return !isScaffoldFragment(body);
}

/** Reject markdown / prose pasted into code files or internal package names. */
export function isJunkCodeFileContent(path: string, content: string): boolean {
  const normalized = path.trim().replace(/\\/g, '/').replace(/^\.\/+/, '');
  const base = normalized.split('/').pop()?.toLowerCase() ?? '';

  if (base === 'package.json') {
    try {
      const pkg = JSON.parse(content) as { name?: string };
      const name = String(pkg.name ?? '').toLowerCase();
      if (BLOCKED_SCAFFOLD_PACKAGE_NAMES.has(name)) return true;
    } catch {
      return true;
    }
    return false;
  }

  const ext = base.includes('.') ? base.split('.').pop() : '';
  if (!ext || !['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) return false;

  const trim = content.trimStart();
  if (!trim) return true;
  if (/^#{1,6}\s+\S/m.test(trim)) return true;
  if (/^```/.test(trim)) return true;
  if (/^##\s+(PROJECT SUMMARY|COMPONENT LIST|CAD|MECHANICAL|ASSEMBLY)/i.test(content)) return true;
  if (/^[-*]\s+\S/.test(trim) && !/\b(import|export|const|function|class)\b/.test(content)) return true;
  // TS1127 — leading invalid characters (markdown bullets, emoji, etc.)
  if (/^[^\w\s/$`"'@#\[{(]/.test(trim) && !trim.startsWith('//') && !trim.startsWith('/*')) {
    return true;
  }
  return false;
}

function acceptScaffoldFile(path: string, body: string): boolean {
  if (!acceptScaffoldBody(body)) return false;
  if (isJunkCodeFileContent(path, body)) return false;
  return true;
}

/** Extract file paths + contents from model output (fallback when tools are unavailable). */
export function parseScaffoldFiles(content: string): ParsedScaffoldFile[] {
  const found = new Map<string, string>();

  const jsonMatch = content.match(/```json\s*\n([\s\S]*?)```/i);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]) as {
        files?: Array<{ path?: string; name?: string; content?: string }>;
      };
      for (const file of parsed.files ?? []) {
        const rel = normalizeRelativePath(file.path ?? file.name ?? '');
        if (rel && file.content && acceptScaffoldPath(rel) && acceptScaffoldFile(rel, file.content)) {
          found.set(rel, repairScaffoldComposerExport(rel, file.content));
        }
      }
    } catch {
      /* ignore invalid JSON */
    }
  }

  let anonIndex = 0;
  let match: RegExpExecArray | null;
  CODE_FENCE.lastIndex = 0;
  while ((match = CODE_FENCE.exec(content)) !== null) {
    const lang = match[1]?.trim().toLowerCase() ?? '';
    const pathHint = match[2]?.trim() ?? '';
    const body = match[3]?.trimEnd().trimStart() ?? '';
    if (!body || lang === 'diff' || lang === 'json') continue;

    const fromHeader = normalizeRelativePath(pathHint);
    if (fromHeader) {
      if (!acceptScaffoldPath(fromHeader) || !acceptScaffoldFile(fromHeader, body)) continue;
      found.set(fromHeader, repairScaffoldComposerExport(fromHeader, body));
      continue;
    }

    if (!acceptScaffoldBody(body)) continue;

    const fileLine = body.match(
      /^(?:\/\/|#|<!--)\s*(?:file|path)\s*[:=]\s*([^\n*]+)/im
    );
    const fromComment = fileLine ? normalizeRelativePath(fileLine[1]) : null;
    if (fromComment) {
      const stripped = body.replace(fileLine![0], '').trimStart();
      if (!acceptScaffoldPath(fromComment) || !acceptScaffoldFile(fromComment, stripped)) continue;
      found.set(fromComment, repairScaffoldComposerExport(fromComment, stripped));
      continue;
    }

    const fallback = defaultPathForLang(lang, anonIndex++, body);
    if (!acceptScaffoldPath(fallback) || !acceptScaffoldFile(fallback, body)) continue;
    if (!found.has(fallback)) found.set(fallback, repairScaffoldComposerExport(fallback, body));
  }

  return [...found.entries()].map(([path, fileContent]) => ({ path, content: fileContent }));
}

/** Best-effort parse while the model is still streaming (may be incomplete fence). */
export function parseStreamingScaffold(content: string): ParsedScaffoldFile | null {
  const complete = parseScaffoldFiles(content);
  if (complete.length > 0) {
    return complete[complete.length - 1]!;
  }

  const openFence = content.match(/```(\w+)?(?:\s*:\s*([^\n`]+))?\n([\s\S]*)$/);
  if (!openFence) return null;

  const pathHint = openFence[2]?.trim() ?? '';
  const body = openFence[3] ?? '';
  const lang = openFence[1]?.trim().toLowerCase() ?? '';
  const rel =
    normalizeRelativePath(pathHint) ??
    (lang || body ? defaultPathForLang(lang, 0, body) : 'generating.ts');
  if (!body.trim() || isScaffoldFragment(body) || isBlockedScaffoldPath(rel) || isJunkCodeFileContent(rel, body)) {
    return null;
  }

  return { path: rel, content: repairScaffoldComposerExport(rel, body) };
}

export function hasScaffoldFences(text: string): boolean {
  return (text.match(/```/g)?.length ?? 0) >= 2;
}

/** Reasoning-only models may emit fences in the reasoning channel, not content deltas. */
export function pickCodeStreamOutput(full: string, reasoning: string): string {
  if (hasScaffoldFences(full)) return full;
  if (hasScaffoldFences(reasoning)) return reasoning;
  const merged = [full.trim(), reasoning.trim()].filter(Boolean).join('\n\n');
  return merged || full || reasoning;
}
