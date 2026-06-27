export interface ParsedScaffoldFile {
  path: string;
  content: string;
}

const CODE_FENCE =
  /```(?:(?:(\w+)[\s:]*([^\n`]+)?)|([^\n`]+))\n([\s\S]*?)```/g;

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
};

function defaultPathForLang(lang: string, index: number): string {
  const base = LANG_DEFAULT_FILE[lang.toLowerCase()];
  if (!base) return index === 0 ? 'src/main.txt' : `src/file${index}.txt`;
  if (index === 0) return base;
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  return `${stem}_${index}${ext}`;
}

const FILE_PATH_RE =
  /^[\w./\\-]+\.(ts|tsx|js|jsx|json|py|go|rs|java|kt|swift|dart|cs|cpp|c|h|ino|yaml|yml|toml|md|html|css|scss|sql|env|sh|gradle|xml|plist|properties)$/i;

function normalizeRelativePath(raw: string): string | null {
  const path = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '');
  if (!path || path.includes('..') || path.startsWith('/')) return null;
  if (!FILE_PATH_RE.test(path.split('/').pop() ?? path)) return null;
  return path;
}

/** Extract file paths + contents from model output (fallback when tools are unavailable). */
export function parseScaffoldFiles(content: string): ParsedScaffoldFile[] {
  const found = new Map<string, string>();

  const jsonMatch = content.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]) as {
        files?: Array<{ path?: string; name?: string; content?: string }>;
      };
      for (const file of parsed.files ?? []) {
        const rel = normalizeRelativePath(file.path ?? file.name ?? '');
        if (rel && file.content) found.set(rel, file.content);
      }
    } catch {
      /* ignore invalid JSON */
    }
  }

  let anonIndex = 0;
  let match: RegExpExecArray | null;
  CODE_FENCE.lastIndex = 0;
  while ((match = CODE_FENCE.exec(content)) !== null) {
    let lang = match[1]?.trim().toLowerCase() ?? '';
    let pathHint = (match[2] ?? '').trim();
    if (!lang && match[3]) {
      const maybeLang = match[3].trim();
      if (maybeLang && !maybeLang.includes('.') && !maybeLang.includes('/')) {
        lang = maybeLang.toLowerCase();
      } else {
        pathHint = maybeLang;
      }
    }
    const body = match[4]?.trimEnd() ?? '';
    if (!body || lang === 'diff') continue;

    const fromHeader = normalizeRelativePath(pathHint);
    if (fromHeader) {
      found.set(fromHeader, body);
      continue;
    }

    const fileLine = body.match(
      /^(?:\/\/|#|<!--)\s*(?:file|path)\s*[:=]\s*([^\n*]+)/im
    );
    const fromComment = fileLine ? normalizeRelativePath(fileLine[1]) : null;
    if (fromComment) {
      const stripped = body.replace(fileLine![0], '').trimStart();
      found.set(fromComment, stripped);
      continue;
    }

    if (lang) {
      const fallback = defaultPathForLang(lang, anonIndex++);
      if (!found.has(fallback)) found.set(fallback, body);
    }
  }

  const PLAIN_FENCE = /```(\w+)\s*\n([\s\S]*?)```/g;
  let plain: RegExpExecArray | null;
  while ((plain = PLAIN_FENCE.exec(content)) !== null) {
    const lang = plain[1]?.trim().toLowerCase() ?? '';
    const body = plain[2]?.trimEnd() ?? '';
    if (!body || lang === 'diff' || lang === 'json') continue;
    const fallback = defaultPathForLang(lang, anonIndex++);
    if (!found.has(fallback)) found.set(fallback, body);
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
  const rel = normalizeRelativePath(pathHint) ?? (openFence[1] ? `generating.${openFence[1] === 'typescript' ? 'ts' : openFence[1]}` : 'generating.ts');
  if (!body.trim()) return null;

  return { path: rel, content: body };
}
