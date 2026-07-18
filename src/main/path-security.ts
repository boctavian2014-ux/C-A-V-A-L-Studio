import path from "node:path";

export function normalizeWorkspaceRoot(root: string): string {
  return path.resolve(root.trim());
}

function normalizeForCompare(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function pathsEqual(a: string, b: string): boolean {
  return normalizeForCompare(a) === normalizeForCompare(b);
}

export function assertPathInWorkspace(workspaceRoot: string, targetPath: string): string {
  if (!workspaceRoot?.trim()) {
    throw new Error("No workspace open");
  }
  const root = normalizeForCompare(path.resolve(workspaceRoot));
  const resolved = normalizeForCompare(path.resolve(targetPath));
  const sep = path.sep;
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new Error("Path outside workspace");
  }
  return path.resolve(targetPath);
}

export function resolveWorkspacePath(workspaceRoot: string, relativeOrAbsolute: string): string {
  const resolved = path.isAbsolute(relativeOrAbsolute)
    ? path.resolve(relativeOrAbsolute)
    : path.resolve(workspaceRoot, relativeOrAbsolute);
  return assertPathInWorkspace(workspaceRoot, resolved);
}

export function requireWorkspacePath(
  workspaceRoot: string | undefined,
  relativeOrAbsolute: string
): string {
  if (!workspaceRoot?.trim()) {
    throw new Error("No workspace open");
  }
  return resolveWorkspacePath(workspaceRoot, relativeOrAbsolute);
}
