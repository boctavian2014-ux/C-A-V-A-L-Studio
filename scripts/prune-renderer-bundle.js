const fs = require("node:fs");
const path = require("node:path");

const bundle = path.join(__dirname, "..", "dist", "renderer", "workbench-app.js");
const map = `${bundle}.map`;

for (const file of [bundle, map]) {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    console.info("[caval] Removed stale renderer bundle:", path.basename(file));
  }
}
