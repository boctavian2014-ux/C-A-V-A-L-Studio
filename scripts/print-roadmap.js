const fs = require("node:fs");
const path = require("node:path");

const roadmapPath = path.join(__dirname, "..", "docs", "roadmap.md");
process.stdout.write(fs.readFileSync(roadmapPath, "utf8"));
