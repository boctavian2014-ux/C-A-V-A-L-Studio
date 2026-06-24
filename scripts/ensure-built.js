const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const entry = path.join(__dirname, "..", "dist", "main", "electron-main.js");

if (fs.existsSync(entry)) {
  process.exit(0);
}

console.info("[caval] dist/ missing — running production build before start...");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCmd, ["run", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32"
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!fs.existsSync(entry)) {
  console.error("[caval] Build finished but entry point is still missing:", entry);
  process.exit(1);
}
