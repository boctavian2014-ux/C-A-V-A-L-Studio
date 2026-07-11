import fs from "node:fs/promises";
import path from "node:path";

export interface SymbolLocation {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "const" | "variable";
  filePath: string;
  line: number;
  column: number;
}

const SYMBOL_PATTERNS: Array<{ kind: SymbolLocation["kind"]; regex: RegExp }> = [
  { kind: "function", regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/ },
  { kind: "function", regex: /^def\s+(\w+)/ },
  { kind: "class", regex: /^(?:export\s+)?class\s+(\w+)/ },
  { kind: "interface", regex: /^(?:export\s+)?interface\s+(\w+)/ },
  { kind: "type", regex: /^(?:export\s+)?type\s+(\w+)/ },
  { kind: "const", regex: /^(?:export\s+)?const\s+(\w+)/ },
  { kind: "variable", regex: /^(?:export\s+)?(?:let|var)\s+(\w+)/ },
];

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"]);

export function extractSymbolsFromSource(
  filePath: string,
  source: string
): SymbolLocation[] {
  const symbols: SymbolLocation[] = [];
  const lines = source.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    for (const { kind, regex } of SYMBOL_PATTERNS) {
      const match = line.match(regex);
      if (match?.[1]) {
        symbols.push({
          name: match[1],
          kind,
          filePath,
          line: i + 1,
          column: line.indexOf(match[1]) + 1,
        });
        break;
      }
    }
  }

  return symbols;
}

export async function indexWorkspaceSymbols(
  workspaceRoot: string,
  maxFiles = 400
): Promise<SymbolLocation[]> {
  const symbols: SymbolLocation[] = [];
  let scanned = 0;

  async function walk(dir: string): Promise<void> {
    if (scanned >= maxFiles) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (scanned >= maxFiles) return;
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;

      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (CODE_EXTENSIONS.has(path.extname(entry.name))) {
        scanned++;
        try {
          const content = await fs.readFile(full, "utf8");
          const rel = path.relative(workspaceRoot, full).replace(/\\/g, "/");
          symbols.push(...extractSymbolsFromSource(rel, content));
        } catch {
          /* skip unreadable */
        }
      }
    }
  }

  await walk(workspaceRoot);
  return symbols;
}

export function findSymbolDefinition(
  symbols: SymbolLocation[],
  name: string,
  preferredFile?: string
): SymbolLocation | undefined {
  const matches = symbols.filter((s) => s.name === name);
  if (matches.length === 0) return undefined;
  if (preferredFile) {
    const inFile = matches.find((s) => s.filePath === preferredFile);
    if (inFile) return inFile;
  }
  return matches[0];
}

export function findSymbolReferences(
  symbols: SymbolLocation[],
  name: string
): SymbolLocation[] {
  return symbols.filter((s) => s.name === name);
}

export interface TextReferenceHit {
  filePath: string;
  line: number;
  column: number;
  preview: string;
}

export async function findTextReferencesInWorkspace(
  workspaceRoot: string,
  symbolName: string,
  maxResults = 120
): Promise<TextReferenceHit[]> {
  if (!symbolName.trim()) return [];
  const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordRe = new RegExp(`\\b${escaped}\\b`);
  const hits: TextReferenceHit[] = [];

  async function walk(dir: string): Promise<void> {
    if (hits.length >= maxResults) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (hits.length >= maxResults) return;
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (CODE_EXTENSIONS.has(path.extname(entry.name))) {
        try {
          const content = await fs.readFile(full, "utf8");
          const lines = content.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const match = wordRe.exec(lines[i]);
            if (match) {
              hits.push({
                filePath: path.relative(workspaceRoot, full).replace(/\\/g, "/"),
                line: i + 1,
                column: match.index + 1,
                preview: lines[i].trim(),
              });
              if (hits.length >= maxResults) return;
            }
          }
        } catch {
          /* skip */
        }
      }
    }
  }

  await walk(workspaceRoot);
  return hits;
}
