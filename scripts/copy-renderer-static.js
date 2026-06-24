const fs = require("node:fs");
const path = require("node:path");

const source = path.join(__dirname, "..", "src", "renderer", "index.html");
const targetDir = path.join(__dirname, "..", "dist", "renderer");
const target = path.join(targetDir, "index.html");

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
