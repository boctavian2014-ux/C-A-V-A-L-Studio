const fs = require("node:fs");
const path = require("node:path");

const source = path.join(__dirname, "..", "src", "renderer", "index.html");
const shimSource = path.join(__dirname, "..", "src", "renderer", "global-shim.js");
const targetDir = path.join(__dirname, "..", "dist", "renderer");
const target = path.join(targetDir, "index.html");
const shimTarget = path.join(targetDir, "global-shim.js");

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(shimSource, shimTarget);

let html = fs.readFileSync(source, "utf8");
const cacheBust = Date.now();

const scriptTags = ['<script src="./global-shim.js"></script>'];
if (fs.existsSync(path.join(targetDir, "monaco.js"))) {
  scriptTags.push(`<script src="./monaco.js?v=${cacheBust}"></script>`);
}
scriptTags.push(`<script src="./workbench-app.js?v=${cacheBust}"></script>`);

const scriptsBlock = scriptTags.join("\n    ");

if (/<script\s+src="\.\/global-shim\.js"><\/script>[\s\S]*?<script\s+src="\.\/workbench-app\.js[^"]*"><\/script>/.test(html)) {
  html = html.replace(
    /<script\s+src="\.\/global-shim\.js"><\/script>[\s\S]*?<script\s+src="\.\/workbench-app\.js[^"]*"><\/script>/,
    scriptsBlock
  );
} else if (/src="\.\/workbench-app\.js(\?v=\d+)?"/.test(html)) {
  html = html.replace(
    /(?:<script\s+src="\.\/global-shim\.js"><\/script>\s*)?<script\s+src="\.\/workbench-app\.js[^"]*"><\/script>/,
    scriptsBlock
  );
} else if (/<\/body>/i.test(html)) {
  html = html.replace(/<\/body>/i, `    ${scriptsBlock}\n  </body>`);
} else {
  html += `\n${scriptsBlock}\n`;
}

fs.writeFileSync(target, html);
