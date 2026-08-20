/**
 * Pas 7d.1 — regex-based parse of source files into IndexedFile.
 * No TypeScript compiler API; good enough for structure hints.
 */

import path from "node:path";

import type { IndexedFile, IndexedSymbol } from "../../shared/workspace-index-contract";
import { normalizeIndexRelativePath } from "../../shared/workspace-index-contract";

const IMPORT_FROM =
  /^\s*import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/;
const IMPORT_SIDE =
  /^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/;
const REQUIRE =
  /^\s*(?:const|let|var)\s+\w[\w{}.\s,]*\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/;
const PY_IMPORT = /^\s*(?:from\s+(\S+)\s+import|import\s+(\S+))/;

const EXPORT_FN =
  /^\s*export\s+(?:async\s+)?function\s+(\w+)/;
const EXPORT_CLASS = /^\s*export\s+class\s+(\w+)/;
const EXPORT_CONST = /^\s*export\s+const\s+(\w+)/;
const EXPORT_INTERFACE = /^\s*export\s+interface\s+(\w+)/;
const EXPORT_TYPE = /^\s*export\s+type\s+(\w+)/;
const EXPORT_ENUM = /^\s*export\s+enum\s+(\w+)/;
const EXPORT_DEFAULT_FN =
  /^\s*export\s+default\s+(?:async\s+)?function(?:\s+(\w+))?/;
const EXPORT_DEFAULT_CLASS =
  /^\s*export\s+default\s+class(?:\s+(\w+))?/;
const NAMED_EXPORT = /^\s*export\s+\{\s*([^}]+)\s*\}/;

const PY_DEF = /^\s*def\s+(\w+)\s*\(/;
const PY_CLASS = /^\s*class\s+(\w+)\s*[:(]/

function pushUnique(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value);
}

function pushSymbol(
  symbols: IndexedSymbol[],
  exports: string[],
  name: string,
  kind: IndexedSymbol["kind"],
  line: number,
  asExport = true
): void {
  symbols.push({ name, kind, line });
  if (asExport) pushUnique(exports, name);
}

export function languageForPath(relativePath: string): string {
  const ext = path.extname(relativePath).slice(1).toLowerCase();
  return ext || "unknown";
}

export function parseIndexedFile(
  relativePath: string,
  content: string,
  sizeBytes?: number
): IndexedFile {
  const rel = normalizeIndexRelativePath(relativePath);
  const symbols: IndexedSymbol[] = [];
  const imports: string[] = [];
  const exports: string[] = [];
  const lines = content.split(/\r?\n/);
  const lang = languageForPath(rel);
  const isPy = lang === "py";
  const isJson = lang === "json";

  if (isJson) {
    return {
      path: rel,
      language: lang,
      symbols: [],
      imports: [],
      exports: [],
      sizeBytes: sizeBytes ?? Buffer.byteLength(content, "utf8"),
      lastIndexed: Date.now(),
    };
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    if (isPy) {
      const pyImp = line.match(PY_IMPORT);
      if (pyImp) {
        pushUnique(imports, (pyImp[1] || pyImp[2] || "").replace(/,$/, ""));
      }
      const pyDef = line.match(PY_DEF);
      if (pyDef?.[1] && !line.trimStart().startsWith("#")) {
        // Treat top-level defs as exports for navigation; nested indented skip.
        if (!/^\s/.test(line)) {
          pushSymbol(symbols, exports, pyDef[1], "function", lineNo, true);
        } else {
          symbols.push({ name: pyDef[1], kind: "function", line: lineNo });
        }
      }
      const pyClass = line.match(PY_CLASS);
      if (pyClass?.[1] && !/^\s/.test(line)) {
        pushSymbol(symbols, exports, pyClass[1], "class", lineNo, true);
      }
      continue;
    }

    const fromImport = line.match(IMPORT_FROM);
    if (fromImport?.[1]) pushUnique(imports, fromImport[1]);
    const sideImport = line.match(IMPORT_SIDE);
    if (sideImport?.[1]) pushUnique(imports, sideImport[1]);
    const req = line.match(REQUIRE);
    if (req?.[1]) pushUnique(imports, req[1]);

    let m: RegExpMatchArray | null;
    if ((m = line.match(EXPORT_FN))) {
      pushSymbol(symbols, exports, m[1], "function", lineNo);
      continue;
    }
    if ((m = line.match(EXPORT_CLASS))) {
      pushSymbol(symbols, exports, m[1], "class", lineNo);
      continue;
    }
    if ((m = line.match(EXPORT_INTERFACE))) {
      pushSymbol(symbols, exports, m[1], "interface", lineNo);
      continue;
    }
    if ((m = line.match(EXPORT_TYPE))) {
      pushSymbol(symbols, exports, m[1], "type", lineNo);
      continue;
    }
    if ((m = line.match(EXPORT_ENUM))) {
      pushSymbol(symbols, exports, m[1], "export", lineNo);
      continue;
    }
    if ((m = line.match(EXPORT_CONST))) {
      pushSymbol(symbols, exports, m[1], "const", lineNo);
      continue;
    }
    if ((m = line.match(EXPORT_DEFAULT_FN))) {
      pushSymbol(symbols, exports, m[1] || "default", "function", lineNo);
      continue;
    }
    if ((m = line.match(EXPORT_DEFAULT_CLASS))) {
      pushSymbol(symbols, exports, m[1] || "default", "class", lineNo);
      continue;
    }
    if ((m = line.match(NAMED_EXPORT))) {
      for (const part of m[1].split(",")) {
        const cleaned = part
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/i)
          .pop()
          ?.trim();
        if (cleaned && /^[\w$]+$/.test(cleaned)) {
          pushSymbol(symbols, exports, cleaned, "export", lineNo);
        }
      }
    }
  }

  return {
    path: rel,
    language: lang,
    symbols,
    imports,
    exports,
    sizeBytes: sizeBytes ?? Buffer.byteLength(content, "utf8"),
    lastIndexed: Date.now(),
  };
}
