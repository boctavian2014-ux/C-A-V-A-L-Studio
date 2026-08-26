/**
 * Internal cache / agent metadata must never become the user-facing active document.
 */

export const INTERNAL_WORKSPACE_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  ".git",
  ".next",
  ".turbo",
  ".cache",
  ".caval",
  ".cavalo",
  ".agent",
  "context-cache",
  "coverage",
  "__pycache__",
]);

const STARTUP_CANDIDATES = [
  "README.md",
  "readme.md",
  "package.json",
  "src/App.tsx",
  "src/app.tsx",
  "src/main.tsx",
  "src/index.tsx",
  "src/index.ts",
  "src/main.ts",
  "index.html",
];

function posixSegments(input: string): string[] {
  return input
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .split("/")
    .filter((seg) => seg.length > 0 && seg !== ".");
}

function relativeSegments(filePath: string, workspaceRoot?: string | null): string[] {
  let value = filePath.trim();
  if (!value) return [];

  if (workspaceRoot?.trim()) {
    const root = workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
    const file = value.replace(/\\/g, "/");
    const rootLower = root.toLowerCase();
    const fileLower = file.toLowerCase();
    if (fileLower === rootLower) return [];
    if (fileLower.startsWith(`${rootLower}/`)) {
      value = file.slice(root.length).replace(/^\/+/, "");
    }
  }

  return posixSegments(value);
}

/** Directory names skipped while walking a workspace for editor/startup files. */
export function isInternalWorkspaceDirName(name: string): boolean {
  return INTERNAL_WORKSPACE_DIR_NAMES.has(name.toLowerCase());
}

function hasInternalAdjacentCache(segments: string[]): boolean {
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (
      segments[i].toLowerCase() === "caval" &&
      segments[i + 1].toLowerCase() === "context-cache"
    ) {
      return true;
    }
  }
  return false;
}

function segmentsAreInternal(segments: string[]): boolean {
  if (segments.length === 0) return false;
  if (segments.some((seg) => INTERNAL_WORKSPACE_DIR_NAMES.has(seg.toLowerCase()))) {
    return true;
  }
  if (hasInternalAdjacentCache(segments)) return true;
  const last = segments[segments.length - 1]?.toLowerCase();
  if (last === "documents.json" && segments.some((seg) => seg.toLowerCase() === "context-cache")) {
    return true;
  }
  return false;
}

/** True when the bound folder itself is cache/agent metadata (must not host editable docs). */
export function isInternalWorkspaceRoot(workspaceRoot?: string | null): boolean {
  if (!workspaceRoot?.trim()) return false;
  return segmentsAreInternal(posixSegments(workspaceRoot));
}

/**
 * True for cache, agent metadata, and the Windows-stripped `.caval` → `caval/context-cache` form.
 */
export function isInternalWorkspacePath(
  filePath: string,
  workspaceRoot?: string | null
): boolean {
  if (isInternalWorkspaceRoot(workspaceRoot)) return true;
  return segmentsAreInternal(relativeSegments(filePath, workspaceRoot));
}

export interface WorkspaceStartupFile {
  path: string;
  label: string;
}

/** Prefer README / package.json / App entry over DFS-first cache JSON. */
export function pickWorkspaceStartupFile<T extends WorkspaceStartupFile>(
  files: T[]
): T | undefined {
  const userFiles = files.filter((file) => !isInternalWorkspacePath(file.label || file.path));
  if (userFiles.length === 0) return undefined;

  for (const candidate of STARTUP_CANDIDATES) {
    const match = userFiles.find(
      (file) => (file.label || file.path).replace(/\\/g, "/").toLowerCase() === candidate.toLowerCase()
    );
    if (match) return match;
  }

  return userFiles[0];
}
