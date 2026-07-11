import { ipcMain } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { parseIpcInput, searchTextSchema, symbolLookupSchema } from "./ipc-schemas";
import { assertPathInWorkspace } from "./path-security";
import { recordAudit } from "./audit-log";
import {
  findSymbolDefinition,
  findSymbolReferences,
  findTextReferencesInWorkspace,
  indexWorkspaceSymbols,
} from "../../context-engine/symbol-index";

export interface TextSearchHit {
  path: string;
  line: number;
  column: number;
  preview: string;
}

const symbolCache = new Map<string, Awaited<ReturnType<typeof indexWorkspaceSymbols>>>();

async function runRipgrep(
  workspaceRoot: string,
  query: string,
  caseSensitive: boolean,
  maxResults: number
): Promise<TextSearchHit[]> {
  const args = [
    "--json",
    "--line-number",
    "--column",
    "--max-count",
    String(maxResults),
    caseSensitive ? "--case-sensitive" : "--ignore-case",
    query,
    workspaceRoot,
  ];

  return new Promise((resolve) => {
    const child = spawn("rg", args, { cwd: workspaceRoot, windowsHide: true });
    const hits: TextSearchHit[] = [];
    let buffer = "";

    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const payload = JSON.parse(line) as {
            type: string;
            data?: {
              path?: { text?: string };
              line_number?: number;
              submatches?: Array<{ start?: number; match?: { text?: string } }>;
              lines?: { text?: string };
            };
          };
          if (payload.type !== "match" || !payload.data) continue;
          const rel = payload.data.path?.text
            ? path.relative(workspaceRoot, payload.data.path.text).replace(/\\/g, "/")
            : "unknown";
          hits.push({
            path: rel,
            line: payload.data.line_number ?? 1,
            column: (payload.data.submatches?.[0]?.start ?? 0) + 1,
            preview: (payload.data.lines?.text ?? "").trim(),
          });
        } catch {
          /* skip malformed rg json */
        }
      }
    });

    child.on("close", () => resolve(hits.slice(0, maxResults)));
    child.on("error", () => resolve(fallbackTextSearch(workspaceRoot, query, maxResults)));
  });
}

async function fallbackTextSearch(
  workspaceRoot: string,
  query: string,
  maxResults: number
): Promise<TextSearchHit[]> {
  const hits: TextSearchHit[] = [];
  const needle = query.toLowerCase();

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
      } else {
        try {
          const content = await fs.readFile(full, "utf8");
          const lines = content.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const idx = lines[i].toLowerCase().indexOf(needle);
            if (idx >= 0) {
              hits.push({
                path: path.relative(workspaceRoot, full).replace(/\\/g, "/"),
                line: i + 1,
                column: idx + 1,
                preview: lines[i].trim(),
              });
              if (hits.length >= maxResults) return;
            }
          }
        } catch {
          /* skip binary */
        }
      }
    }
  }

  await walk(workspaceRoot);
  return hits;
}

export function registerSearchHandlers(getWorkspaceRoot: (senderId: number) => string): void {
  ipcMain.handle("caval:search-text", async (event, input: unknown) => {
    const parsed = parseIpcInput(searchTextSchema, input);
    const root = getWorkspaceRoot(event.sender.id) || parsed.workspaceRoot;
    try {
      assertPathInWorkspace(root, root);
      const hits = await runRipgrep(
        root,
        parsed.query,
        parsed.caseSensitive ?? false,
        parsed.maxResults ?? 100
      );
      recordAudit({
        channel: "caval:search-text",
        action: "search",
        workspaceRoot: root,
        detail: parsed.query,
        ok: true,
      });
      return { ok: true, hits };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordAudit({
        channel: "caval:search-text",
        action: "search",
        workspaceRoot: root,
        detail: message,
        ok: false,
      });
      return { ok: false, error: message, hits: [] };
    }
  });

  ipcMain.handle("caval:symbol-index", async (event, workspaceRoot?: string) => {
    const root = workspaceRoot || getWorkspaceRoot(event.sender.id);
    if (!root?.trim()) return { ok: false, error: "No workspace" };
    try {
      assertPathInWorkspace(root, root);
      const symbols = await indexWorkspaceSymbols(root);
      symbolCache.set(root, symbols);
      return { ok: true, count: symbols.length };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("caval:goto-definition", async (event, input: unknown) => {
    const parsed = parseIpcInput(symbolLookupSchema, input);
    const root = getWorkspaceRoot(event.sender.id) || parsed.workspaceRoot;
    try {
      assertPathInWorkspace(root, path.join(root, parsed.filePath));
      let symbols = symbolCache.get(root);
      if (!symbols) {
        symbols = await indexWorkspaceSymbols(root);
        symbolCache.set(root, symbols);
      }
      const def = findSymbolDefinition(symbols, parsed.symbol, parsed.filePath);
      if (!def) return { ok: false, error: `Symbol not found: ${parsed.symbol}` };
      return { ok: true, location: def };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("caval:find-references", async (event, input: unknown) => {
    const parsed = parseIpcInput(symbolLookupSchema, input);
    const root = getWorkspaceRoot(event.sender.id) || parsed.workspaceRoot;
    try {
      assertPathInWorkspace(root, path.join(root, parsed.filePath));
      let symbols = symbolCache.get(root);
      if (!symbols) {
        symbols = await indexWorkspaceSymbols(root);
        symbolCache.set(root, symbols);
      }
      const defs = findSymbolReferences(symbols, parsed.symbol);
      const textHits = await findTextReferencesInWorkspace(root, parsed.symbol, 120);
      const seen = new Set<string>();
      const references = [...defs, ...textHits]
        .map((ref) => ({
          filePath: ref.filePath,
          line: ref.line,
          column: ref.column,
          preview: "preview" in ref ? ref.preview : undefined,
        }))
        .filter((ref) => {
          const key = `${ref.filePath}:${ref.line}:${ref.column}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      return { ok: true, references };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
