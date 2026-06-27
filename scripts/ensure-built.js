const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const mainEntry = path.join(root, "dist", "main", "electron-main.js");
const rendererBundle = path.join(root, "dist", "renderer", "workbench-app.js");
const rendererHtml = path.join(root, "dist", "renderer", "index.html");
const rendererCss = path.join(root, "dist", "renderer", "pulse-tech.css");
const copyStatic = path.join(__dirname, "copy-renderer-static.js");

const SOURCE_DIRS = [
  path.join(root, "src"),
  path.join(root, "ai"),
  path.join(root, "themes"),
  path.join(root, "context-engine"),
];
const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

function newestSourceMtime() {
  let newest = 0;
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "node_modules" || ent.name === "dist") continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (SOURCE_EXTS.has(path.extname(ent.name))) {
        newest = Math.max(newest, fs.statSync(full).mtimeMs);
      }
    }
  };
  for (const dir of SOURCE_DIRS) walk(dir);
  return newest;
}

function bundleMtime(file) {
  if (!fs.existsSync(file)) return 0;
  return fs.statSync(file).mtimeMs;
}

const mainMtime = bundleMtime(mainEntry);
const rendererMtime = bundleMtime(rendererBundle);

const needsBuild =
  mainMtime === 0 ||
  rendererMtime === 0 ||
  newestSourceMtime() > mainMtime ||
  newestSourceMtime() > rendererMtime ||
  !fs.existsSync(rendererHtml) ||
  !fs.existsSync(rendererCss);

function copyRendererAssets() {
  require(copyStatic);
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  spawnSync(npmCmd, ["run", "build:css"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

if (!needsBuild) {
  if (!fs.existsSync(rendererHtml) || !fs.existsSync(rendererCss)) {
    console.info("[caval] Copying renderer static assets...");
    copyRendererAssets();
  }
  process.exit(0);
}

console.info("[caval] Source changed — rebuilding before start...");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const buildScript = process.env.CAVAL_PRODUCTION_BUILD === "1" ? "build" : "build:dev";
const result = spawnSync(npmCmd, ["run", buildScript], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!fs.existsSync(mainEntry)) {
  console.error("[caval] Build finished but entry point is still missing:", mainEntry);
  process.exit(1);
}

copyRendererAssets();
