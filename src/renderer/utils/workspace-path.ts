/**
 * Pure workspace path helpers for the renderer (no node:path).
 */

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

function isAbsolutePath(p: string): boolean {
  return /^[a-zA-Z]:/.test(p) || p.startsWith("/");
}

/**
 * Convert an absolute or relative path to a workspace-relative POSIX path for IPC.
 * Returns null when the path is outside the workspace or not a normal file path.
 */
export function toWorkspaceRelativePath(
  workspaceRoot: string | null | undefined,
  filePath: string
): string | null {
  if (!workspaceRoot?.trim() || !filePath?.trim()) return null;

  let file = filePath.trim();
  if (file.startsWith("preview://")) {
    file = file.slice("preview://".length);
  }
  if (file.startsWith("untitled:")) return null;

  const root = normalizeSlashes(workspaceRoot);
  const normalized = normalizeSlashes(file);

  if (!isAbsolutePath(normalized)) {
    const rel = normalized.replace(/^\/+/, "");
    if (!rel || rel.split("/").some((seg) => seg === "..")) return null;
    return rel;
  }

  const rootLower = root.toLowerCase();
  const fileLower = normalized.toLowerCase();
  if (fileLower !== rootLower && !fileLower.startsWith(`${rootLower}/`)) {
    return null;
  }

  const rel = normalized.slice(root.length).replace(/^\/+/, "");
  if (!rel || rel.split("/").some((seg) => seg === "..")) return null;
  return rel;
}

/** Explorer highlight: tab ids are absolute display paths; tree ids are relative. */
export function isFileTreeNodeActive(
  node: { type: string; id: string; path: string },
  activeTabId: string | null,
  projectPath: string | null
): boolean {
  if (node.type !== "file" || !activeTabId) return false;
  if (activeTabId === node.id || activeTabId === node.path) return true;
  const activeRel = toWorkspaceRelativePath(projectPath, activeTabId)?.toLowerCase();
  if (!activeRel) return false;
  const nodeRel = (
    toWorkspaceRelativePath(projectPath, node.path) ?? node.id.replace(/\\/g, "/")
  ).toLowerCase();
  return activeRel === nodeRel;
}

/** Display path for tabs — keeps absolute when workspace root is known. */
export function toWorkspaceDisplayPath(
  workspaceRoot: string | null | undefined,
  relativePath: string
): string {
  if (!workspaceRoot?.trim()) return relativePath;
  const sep = workspaceRoot.includes("\\") ? "\\" : "/";
  const rel = relativePath.replace(/[/\\]+/g, sep).replace(new RegExp(`^\\${sep}+`), "");
  return `${workspaceRoot.replace(/[/\\]+$/, "")}${sep}${rel}`;
}
