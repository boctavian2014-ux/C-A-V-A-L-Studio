#!/usr/bin/env tsx
/**
 * Pragmatic hardcoded UI-string scanner for Caval Studio renderer/UI (7g.5).
 *
 * Focuses on high-signal patterns (not full AST):
 * - window.confirm / alert / prompt string literals
 * - showWorkbenchToast string literals
 * - title / aria-label / placeholder string attributes
 * - JSX children that look like short UI sentences (not code)
 *
 * Usage: npm run i18n:audit
 * Exit 0 always (report-only) unless --strict is passed.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SCAN_ROOTS = [
  "src/renderer/components",
  "src/renderer/commands",
  "src/renderer/store",
  "ai/composer",
  "marketplace/client/ui",
];

/** Intentional EN product / brand / technical IDs — not treated as gaps. */
const ALLOWLIST: RegExp[] = [
  /\bCAVAL\b/i,
  /\bCAVALLO\b/i,
  /\bCaval\b/,
  /\bOpenRouter\b/,
  /\bOllama\b/,
  /\bOpenAI\b/,
  /\bAnthropic\b/,
  /\bGemini\b/,
  /\bMonaco\b/,
  /\bElectron\b/,
  /\bGitHub\b/,
  /\bOpenSCAD\b/,
  /\bTRELLIS\b/,
  /\bMeshy\b/,
  /\bPiAPI\b/,
  /\bBYOK\b/,
  /\bMCP\b/,
  /\bUIC\b/,
  /\bCtrl[+ ]/,
  /\bCmdOrCtrl\+/,
  /\bShift\+/,
  /\bAlt\+/,
  /\bF\d+\b/,
  /\bpackage\.json\b/,
  /\bcaval\.jsonc\b/,
  /\.cavalo\//,
  /\bCAD_API_KEY\b/,
  /\bWorker ✓\b/,
  /\bMeshy ✓\b/,
  /^https?:\/\//,
  /^[A-Z][A-Z0-9_]{2,}$/,
  /Downloads|Desktop/,
];

const SKIP_FILE = /(node_modules|dist|\.test\.|\.spec\.|locales[/\\])/i;

interface Finding {
  file: string;
  line: number;
  kind: string;
  text: string;
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(full, out);
    } else if (/\.(tsx|ts)$/.test(entry.name) && !SKIP_FILE.test(full)) {
      out.push(full);
    }
  }
  return out;
}

function isAllowlisted(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 3) return true;
  if (!/[A-Za-zăâîșțĂÂÎȘȚ]/.test(trimmed)) return true;
  if (ALLOWLIST.some((re) => re.test(trimmed))) return true;
  if (/^[a-z0-9_./\\:-]+$/i.test(trimmed) && !/\s/.test(trimmed)) return true;
  return false;
}

function looksUserFacing(text: string): boolean {
  const t = text.trim();
  if (t.length < 4 || t.length > 200) return false;
  if (!/[A-Za-zăâîșțĂÂÎȘȚ]/.test(t)) return false;
  if (isAllowlisted(t)) return false;
  // Skip code-ish
  if (/[{}();=<>`]/.test(t)) return false;
  if (/\b(?:function|const|return|import|export|typeof|void)\b/.test(t)) return false;
  if (/\$\{/.test(t)) return false;
  // Prefer phrases with spaces or diacritics
  if (/\s/.test(t) || /[ăâîșțĂÂÎȘȚ]/.test(t)) return true;
  return /^[A-Z][a-z].{2,}/.test(t);
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}

function nearTranslator(content: string, index: number): boolean {
  const start = Math.max(0, index - 100);
  return /\bt(?:Active)?\s*\(/.test(content.slice(start, index));
}

function scanFile(file: string): Finding[] {
  const content = fs.readFileSync(file, "utf8");
  const findings: Finding[] = [];
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");

  const push = (kind: string, text: string, index: number) => {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!looksUserFacing(cleaned)) return;
    if (nearTranslator(content, index)) return;
    findings.push({ file: rel, line: lineOf(content, index), kind, text: cleaned.slice(0, 140) });
  };

  // confirm / alert / prompt
  for (const kind of ["confirm", "alert", "prompt"] as const) {
    const re = new RegExp(`(?:window\\.)?${kind}\\(\\s*(['"\`])([\\s\\S]*?)\\1`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) push(kind, m[2], m.index);
  }

  // toast literals
  {
    const re = /showWorkbenchToast\(\s*(['"`])([\s\S]*?)\1/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) push("toast", m[2], m.index);
  }

  // title / aria-label / placeholder = "..."
  {
    const re =
      /(?:title|aria-label|placeholder|alt)\s*=\s*(?:\{\s*)?(['"`])([^'"`\n]{3,})\1/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) push("attr", m[2], m.index);
  }

  // JSX text between tags — only simple text nodes on their own line-ish
  {
    const re = />\s*\n?\s*([A-Za-zăâîșțĂÂÎȘȚ][^<>{}/]{2,120}?)\s*\n?\s*</g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const text = m[1].trim();
      if (text.includes("\n") && text.length > 80) continue;
      push("jsx-text", text, m.index);
    }
  }

  return findings;
}

function main(): void {
  const strict = process.argv.includes("--strict");
  const files = SCAN_ROOTS.flatMap((r) => walk(path.join(ROOT, r)));
  const all: Finding[] = [];
  for (const f of files) all.push(...scanFile(f));

  const seen = new Set<string>();
  const unique = all.filter((f) => {
    const k = `${f.file}:${f.line}:${f.kind}:${f.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  console.log(`i18n audit — scanned ${files.length} UI files`);
  console.log(`findings (after allowlist / heuristics): ${unique.length}`);
  console.log(
    "Note: Electron native app menu (src/main/electron-main.ts) is out of scope — known gap."
  );

  if (unique.length === 0) {
    console.log("No remaining hardcoded user-facing strings matched heuristics.");
  } else {
    const byFile = new Map<string, Finding[]>();
    for (const f of unique) {
      const list = byFile.get(f.file) ?? [];
      list.push(f);
      byFile.set(f.file, list);
    }
    for (const [file, list] of [...byFile.entries()].sort()) {
      console.log(`\n${file} (${list.length})`);
      for (const f of list.slice(0, 25)) {
        console.log(`  L${f.line} [${f.kind}] ${JSON.stringify(f.text)}`);
      }
      if (list.length > 25) console.log(`  … +${list.length - 25} more`);
    }
  }

  if (strict && unique.length > 0) process.exit(1);
}

main();
