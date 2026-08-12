import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

const REQUIRED_RUNTIME_ASSETS = [
  "dist/main/electron-main.js",
  "dist/main/preload.js",
  "dist/main/parallel-worker.js",
  "dist/main/preload-worker.js",
  "dist/main/context-parallel-worker.js",
  "dist/renderer/index.html",
  "dist/renderer/workbench-app.js",
  "dist/renderer/global-shim.js",
  "dist/renderer/pulse-tech.css",
] as const;

const STARTUP_MAIN = "dist/main/electron-main.js";

function fail(message: string): never {
  console.error(`[verify-runtime-assets] ${message}`);
  process.exit(1);
}

function readUtf8(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function collectJsFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(full, acc);
      continue;
    }
    if (/\.(js|html|css)$/i.test(entry.name)) acc.push(full);
  }
  return acc;
}

function workspacePathNeedles(): string[] {
  const resolved = path.resolve(ROOT);
  const needles = new Set<string>([
    resolved,
    resolved.replaceAll("/", "\\"),
    resolved.replaceAll("\\", "/"),
    resolved.replaceAll("\\", "\\\\"),
  ]);
  return [...needles].filter((n) => n.length > 8);
}

export function findBakedAbsoluteWorkspacePaths(distDir = DIST, root = ROOT): string[] {
  const needles = workspacePathNeedles().map((n) => n.toLowerCase());
  const hits: string[] = [];
  for (const file of collectJsFiles(distDir)) {
    const text = fs.readFileSync(file, "utf8");
    const lower = text.toLowerCase();
    if (needles.some((needle) => lower.includes(needle))) {
      hits.push(path.relative(root, file).replaceAll("\\", "/"));
    }
  }
  return hits;
}

export function missingRuntimeAssets(root = ROOT): string[] {
  return REQUIRED_RUNTIME_ASSETS.filter((rel) => !fs.existsSync(path.join(root, rel)));
}

function assertStartupScripts(): void {
  const pkg = JSON.parse(readUtf8("package.json")) as { main?: string; scripts?: Record<string, string> };
  if (pkg.main !== STARTUP_MAIN) {
    fail(`package.json "main" must be ${STARTUP_MAIN}, got ${pkg.main ?? "(missing)"}`);
  }
  const start = pkg.scripts?.start ?? "";
  if (!start.includes("ensure-built") || !/\belectron\s+\./.test(start)) {
    fail(`package.json "start" must use ensure-built + electron . ; got: ${start}`);
  }
  const ensureBuilt = readUtf8("scripts/ensure-built.js");
  if (!ensureBuilt.includes("dist") || !ensureBuilt.includes("electron-main.js")) {
    fail("scripts/ensure-built.js must verify dist/main/electron-main.js");
  }
  const builder = readUtf8("installer/config/electron-builder.yml");
  if (!builder.includes("main: dist/main/electron-main.js")) {
    fail("electron-builder extraMetadata.main must be dist/main/electron-main.js");
  }
}

export function verifyRuntimeAssets(root = ROOT): void {
  const missing = missingRuntimeAssets(root);
  if (missing.length > 0) {
    fail(`Missing runtime assets:\n  - ${missing.join("\n  - ")}`);
  }
  const baked = findBakedAbsoluteWorkspacePaths(path.join(root, "dist"), root);
  if (baked.length > 0) {
    fail(`Build output contains local absolute workspace paths:\n  - ${baked.join("\n  - ")}`);
  }
  assertStartupScripts();
  console.log("[verify-runtime-assets] ok");
  for (const rel of REQUIRED_RUNTIME_ASSETS) {
    console.log(`  [ok] ${rel}`);
  }
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("verify-runtime-assets.ts");
if (isMain) {
  verifyRuntimeAssets();
}
