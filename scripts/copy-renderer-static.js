const fs = require("node:fs");
const path = require("node:path");

const source = path.join(__dirname, "..", "src", "renderer", "index.html");
const targetDir = path.join(__dirname, "..", "dist", "renderer");
const target = path.join(targetDir, "index.html");

fs.mkdirSync(targetDir, { recursive: true });

let html = fs.readFileSync(source, "utf8");
const cacheBust = Date.now();
html = html.replace(
  /src="\.\/workbench-app\.js(\?v=\d+)?"/,
  `src="./workbench-app.js?v=${cacheBust}"`
);
fs.writeFileSync(target, html);
