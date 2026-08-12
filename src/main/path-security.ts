import fs from "node:fs";
import path from "node:path";

/**
 * IPC content / batch size limits (Lot A filesystem remediation).
 *
 * Documented so CAD/ZIP exports are not silently broken:
 * - TEXT_BYTES 25 MiB — editor text, SCAD source, engineering markdown/JSON
 * - STL_BYTES 100 MiB — decoded STL meshes (CAD / robotics library)
 * - STL_BASE64_CHARS — base64 ceiling matching STL_BYTES (~4/3 encoding)
 * - ZIP_TOTAL_BYTES 200 MiB — aggregate decoded STL payload in exportZip
 * - BATCH_FILE_COUNT 200 — engineering:saveAll / zip file entries
 *
 * Raise deliberately if legitimate CAD exports exceed these; do not remove without review.
 */
export const IPC_CONTENT_LIMITS = {
  TEXT_BYTES: 25 * 1024 * 1024,
  STL_BYTES: 100 * 1024 * 1024,
  STL_BASE64_CHARS: Math.ceil((100 * 1024 * 1024 * 4) / 3) + 8,
  ZIP_TOTAL_BYTES: 200 * 1024 * 1024,
  BATCH_FILE_COUNT: 200,
} as const;

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

function isUnderRoot(realRoot: string, realTarget: string): boolean {
  const root = normalizeForCompare(realRoot);
  const target = normalizeForCompare(realTarget);
  const sep = path.sep;
  return target === root || target.startsWith(root + sep);
}

/**
 * Logical path containment (no realpath). Prefer resolveSandboxedWorkspacePath for IPC IO.
 */
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

/**
 * Resolve nearest existing ancestor via realpath, then re-join missing segments.
 * Rejects external absolute escapes and symlink/junction escapes.
 */
function realpathWithMissingLeaf(candidate: string): string {
  const absolute = path.resolve(candidate);
  if (fs.existsSync(absolute)) {
    return fs.realpathSync(absolute);
  }

  const missing: string[] = [];
  let current = absolute;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Path outside workspace");
    }
    missing.push(path.basename(current));
    current = parent;
  }

  let real = fs.realpathSync(current);
  for (const segment of missing.reverse()) {
    real = path.join(real, segment);
  }
  return real;
}

/**
 * Sandbox a path under the bound workspace using realpath.
 *
 * - normalize + realpath(workspaceRoot)
 * - existing file: realpath(destination)
 * - new file: realpath(dirname / nearest ancestor) + remainder
 * - rejects traversal, external absolute paths, junction/symlink escape
 */
export function resolveSandboxedWorkspacePath(
  workspaceRoot: string,
  relativeOrAbsolute: string
): string {
  if (!workspaceRoot?.trim()) {
    throw new Error("No workspace open");
  }
  if (!relativeOrAbsolute?.trim()) {
    throw new Error("Path outside workspace");
  }

  let realRoot: string;
  try {
    realRoot = fs.realpathSync(normalizeWorkspaceRoot(workspaceRoot));
  } catch {
    throw new Error("No workspace open");
  }

  const candidate = path.isAbsolute(relativeOrAbsolute)
    ? path.resolve(relativeOrAbsolute)
    : path.resolve(realRoot, relativeOrAbsolute);

  // Fast logical reject before touching realpath (covers `..` and foreign absolutes).
  assertPathInWorkspace(realRoot, candidate);

  const realTarget = realpathWithMissingLeaf(candidate);
  if (!isUnderRoot(realRoot, realTarget)) {
    throw new Error("Path outside workspace");
  }
  return realTarget;
}

export function requireSandboxedWorkspacePath(
  workspaceRoot: string | undefined,
  relativeOrAbsolute: string
): string {
  if (!workspaceRoot?.trim()) {
    throw new Error("No workspace open");
  }
  return resolveSandboxedWorkspacePath(workspaceRoot, relativeOrAbsolute);
}

/**
 * Resolve a basename-only file under an existing directory, staying inside that dir
 * after realpath (symlink/junction safe). Replaces local resolveInsideDir duplicates.
 */
export function resolveInsideDir(dir: string, fileName: string): string | null {
  if (!dir?.trim() || !fileName?.trim()) return null;
  const base = path.basename(fileName);
  if (!base || base === "." || base === "..") return null;
  try {
    const realDir = fs.realpathSync(path.resolve(dir));
    const dest = resolveSandboxedWorkspacePath(realDir, base);
    if (!isUnderRoot(realDir, dest)) return null;
    return dest;
  } catch {
    return null;
  }
}

export function assertTextContentSize(content: string, label = "content"): void {
  const bytes = Buffer.byteLength(content ?? "", "utf8");
  if (bytes > IPC_CONTENT_LIMITS.TEXT_BYTES) {
    throw new Error(
      `${label} exceeds limit (${bytes} > ${IPC_CONTENT_LIMITS.TEXT_BYTES} bytes)`
    );
  }
}

export function assertStlBase64Size(base64: string): Buffer {
  if ((base64?.length ?? 0) > IPC_CONTENT_LIMITS.STL_BASE64_CHARS) {
    throw new Error(
      `STL base64 exceeds limit (${base64.length} > ${IPC_CONTENT_LIMITS.STL_BASE64_CHARS} chars)`
    );
  }
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > IPC_CONTENT_LIMITS.STL_BYTES) {
    throw new Error(
      `STL buffer exceeds limit (${buffer.length} > ${IPC_CONTENT_LIMITS.STL_BYTES} bytes)`
    );
  }
  return buffer;
}

export function assertBatchFileCount(count: number): void {
  if (count > IPC_CONTENT_LIMITS.BATCH_FILE_COUNT) {
    throw new Error(
      `Batch exceeds file count limit (${count} > ${IPC_CONTENT_LIMITS.BATCH_FILE_COUNT})`
    );
  }
}
