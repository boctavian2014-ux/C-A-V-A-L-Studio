import fs from "node:fs";
import path from "node:path";

function dirLooksLikeMainBundle(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, "parallel-worker.js")) ||
    fs.existsSync(path.join(dir, "preload-worker.js")) ||
    fs.existsSync(path.join(dir, "electron-main.js"))
  );
}

/**
 * Directory that contains webpack-emitted main + worker bundles.
 * Prefer runtime __dirname when it points at a real bundle dir; never keep a
 * webpack-baked relative source path like "src\\main".
 */
function resolveMainBundleDir(): string | null {
  const fromDirname =
    typeof __dirname === "string" && path.isAbsolute(__dirname) ? __dirname : null;

  const candidates: string[] = [];
  if (fromDirname && dirLooksLikeMainBundle(fromDirname)) {
    candidates.push(fromDirname);
  }
  candidates.push(path.resolve(process.cwd(), "dist", "main"));

  const execDir = path.dirname(process.execPath);
  candidates.push(
    path.join(execDir, "resources", "app.asar.unpacked", "dist", "main"),
    path.join(execDir, "resources", "app.asar", "dist", "main")
  );

  for (const candidate of candidates) {
    if (dirLooksLikeMainBundle(candidate)) return candidate;
  }

  return null;
}

function normalizeWorkerFileName(name: string): string {
  return name.endsWith(".js") ? name : `${name}.js`;
}

/**
 * Resolve a bundled worker only when the webpack output file exists.
 * Returns null when no bundle is present (e.g. CI before build).
 */
export function tryResolveBundledWorkerPath(workerFileName: string): string | null {
  const name = normalizeWorkerFileName(workerFileName);
  const baseDir = resolveMainBundleDir();
  if (!baseDir) return null;

  const candidates = [
    path.join(baseDir, name),
    path.join(baseDir, "..", "main", name),
  ];

  for (const candidate of candidates) {
    if (candidate.includes(`${path.sep}app.asar${path.sep}`)) {
      const unpacked = candidate.replace(
        `${path.sep}app.asar${path.sep}`,
        `${path.sep}app.asar.unpacked${path.sep}`
      );
      if (fs.existsSync(unpacked)) return unpacked;
    }
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

/**
 * Resolve a webpack-emitted worker next to the main process bundle.
 * Worker threads cannot execute from inside app.asar — prefer asar.unpacked.
 * Falls back to dist/main when the bundle is not built yet (legacy callers).
 */
export function resolveBundledWorkerPath(workerFileName: string): string {
  const resolved = tryResolveBundledWorkerPath(workerFileName);
  if (resolved) return resolved;
  return path.resolve(process.cwd(), "dist", "main", normalizeWorkerFileName(workerFileName));
}
