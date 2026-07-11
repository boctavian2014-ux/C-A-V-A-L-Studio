import path from "node:path";

export function assertPathInWorkspace(workspaceRoot: string, targetPath: string): string {
  if (!workspaceRoot?.trim()) {
    throw new Error("No workspace open");
  }
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(targetPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Path outside workspace");
  }
  return resolved;
}

export function resolveWorkspacePath(workspaceRoot: string, relativeOrAbsolute: string): string {
  const resolved = path.isAbsolute(relativeOrAbsolute)
    ? path.resolve(relativeOrAbsolute)
    : path.resolve(workspaceRoot, relativeOrAbsolute);
  return assertPathInWorkspace(workspaceRoot, resolved);
}
