/**
 * Pas 7d.1 — JSON persistence for workspace structure index.
 * Regenerable; not conversation history.
 */

import fs from "node:fs/promises";
import path from "node:path";

import {
  WORKSPACE_INDEX_RELATIVE_PATH,
  emptyWorkspaceIndex,
  type IndexedFile,
  type IndexedSymbol,
  type WorkspaceIndex,
} from "../../shared/workspace-index-contract";

export function workspaceIndexPath(workspaceRoot: string): string {
  return path.join(path.resolve(workspaceRoot), ...WORKSPACE_INDEX_RELATIVE_PATH.split("/"));
}

function isSymbol(value: unknown): value is IndexedSymbol {
  if (!value || typeof value !== "object") return false;
  const s = value as IndexedSymbol;
  return (
    typeof s.name === "string" &&
    typeof s.kind === "string" &&
    typeof s.line === "number"
  );
}

function isIndexedFile(value: unknown): value is IndexedFile {
  if (!value || typeof value !== "object") return false;
  const f = value as IndexedFile;
  return (
    typeof f.path === "string" &&
    typeof f.language === "string" &&
    Array.isArray(f.symbols) &&
    f.symbols.every(isSymbol) &&
    Array.isArray(f.imports) &&
    Array.isArray(f.exports) &&
    typeof f.sizeBytes === "number" &&
    typeof f.lastIndexed === "number"
  );
}

export function normalizeWorkspaceIndex(raw: unknown): WorkspaceIndex {
  if (!raw || typeof raw !== "object") return emptyWorkspaceIndex();
  const obj = raw as Partial<WorkspaceIndex>;
  const files = Array.isArray(obj.files) ? obj.files.filter(isIndexedFile) : [];
  return {
    files,
    lastFullScan: typeof obj.lastFullScan === "number" ? obj.lastFullScan : 0,
    totalFiles: files.length,
  };
}

export async function saveWorkspaceIndex(
  workspaceRoot: string,
  index: WorkspaceIndex
): Promise<void> {
  const filePath = workspaceIndexPath(workspaceRoot);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const payload: WorkspaceIndex = {
    files: index.files,
    lastFullScan: index.lastFullScan,
    totalFiles: index.files.length,
  };
  await fs.writeFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

export async function loadWorkspaceIndex(
  workspaceRoot: string
): Promise<WorkspaceIndex | null> {
  try {
    const raw = await fs.readFile(workspaceIndexPath(workspaceRoot), "utf8");
    return normalizeWorkspaceIndex(JSON.parse(raw));
  } catch {
    return null;
  }
}
