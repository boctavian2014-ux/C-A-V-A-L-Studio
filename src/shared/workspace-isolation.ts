/**
 * Bound-folder isolation: chat/context/preview must never fall back to the
 * Caval install directory or another project on disk.
 */

export function normalizeWorkspaceRootPath(input: string): string {
  return input.trim().replace(/\\/g, "/").replace(/\/+$/, "");
}

export function isSameWorkspaceRoot(
  a?: string | null,
  b?: string | null
): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  return normalizeWorkspaceRootPath(a).toLowerCase() === normalizeWorkspaceRootPath(b).toLowerCase();
}

function isAbsolutePath(p: string): boolean {
  return /^[a-zA-Z]:/.test(p) || p.startsWith("/");
}

/** Relative paths stay inside the folder; absolute paths must be under the root. */
export function isInsideWorkspaceRoot(
  workspaceRoot: string | null | undefined,
  filePath: string | null | undefined
): boolean {
  if (!workspaceRoot?.trim() || !filePath?.trim()) return false;
  const root = normalizeWorkspaceRootPath(workspaceRoot);
  const file = filePath.trim().replace(/\\/g, "/");
  const segments = file.split("/").filter(Boolean);
  if (segments.some((seg) => seg === "..")) return false;

  if (!isAbsolutePath(file)) {
    return file.length > 0;
  }

  const rootLower = root.toLowerCase();
  const fileLower = file.toLowerCase();
  return fileLower === rootLower || fileLower.startsWith(`${rootLower}/`);
}

export function filterPathsInsideWorkspace(
  workspaceRoot: string | null | undefined,
  paths: Array<string | null | undefined>
): string[] {
  if (!workspaceRoot?.trim()) return [];
  return paths.filter((p): p is string => Boolean(p && isInsideWorkspaceRoot(workspaceRoot, p)));
}

/**
 * Bound folder wins. Renderer-supplied roots are ignored unless they match.
 * Never use process.cwd() / IDE install as a user workspace.
 */
export function resolveAuthoritativeWorkspaceRoot(input: {
  boundRoot?: string | null;
  rendererRoot?: string | null;
}): string {
  const bound = input.boundRoot?.trim() ?? "";
  if (!bound) return "";
  const renderer = input.rendererRoot?.trim() ?? "";
  if (renderer && !isSameWorkspaceRoot(bound, renderer)) {
    return bound;
  }
  return bound;
}

export const NO_BOUND_WORKSPACE_ERROR =
  "Deschide un folder de proiect. Caval nu citește și nu scrie în alte foldere.";
