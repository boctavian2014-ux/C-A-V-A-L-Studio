const fs = require("node:fs");
const path = require("node:path");

const source = path.join(__dirname, "..", "src", "renderer", "index.html");
const shimSource = path.join(__dirname, "..", "src", "renderer", "global-shim.js");
const targetDir = path.join(__dirname, "..", "dist", "renderer");
const target = path.join(targetDir, "index.html");
const shimTarget = path.join(targetDir, "global-shim.js");

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(shimSource, shimTarget);

const glassSource = path.join(__dirname, "..", "src", "renderer", "styles", "glass.css");
const glassTargetDir = path.join(targetDir, "styles");
if (fs.existsSync(glassSource)) {
  fs.mkdirSync(glassTargetDir, { recursive: true });
  fs.copyFileSync(glassSource, path.join(glassTargetDir, "glass.css"));
}

let html = fs.readFileSync(source, "utf8");
const cacheBust = Date.now();

// Workbench first so the shell paints quickly; Monaco is large (~28MB) and
// must not block the initial UI (otherwise users see a long black screen).
const scriptTags = [
  '<script src="./global-shim.js"></script>',
  `<script src="./workbench-app.js?v=${cacheBust}"></script>`,
];
if (fs.existsSync(path.join(targetDir, "monaco.js"))) {
  scriptTags.push(`<script src="./monaco.js?v=${cacheBust}" defer></script>`);
}

const scriptsBlock = scriptTags.join("\n    ");

if (/<script\s+src="\.\/global-shim\.js"><\/script>[\s\S]*?<script\s+src="\.\/workbench-app\.js[^"]*"><\/script>/.test(html)) {
  html = html.replace(
    /<script\s+src="\.\/global-shim\.js"><\/script>[\s\S]*?<script\s+src="\.\/(?:monaco\.js[^"]*"><\/script>\s*<script\s+src="\.\/)?workbench-app\.js[^"]*"><\/script>(?:\s*<script\s+src="\.\/monaco\.js[^"]*"><\/script>)?/,
    scriptsBlock
  );
} else if (/src="\.\/workbench-app\.js(\?v=\d+)?"/.test(html)) {
  html = html.replace(
    /(?:<script\s+src="\.\/global-shim\.js"><\/script>\s*)?(?:<script\s+src="\.\/monaco\.js[^"]*"><\/script>\s*)?<script\s+src="\.\/workbench-app\.js[^"]*"><\/script>(?:\s*<script\s+src="\.\/monaco\.js[^"]*"><\/script>)?/,
    scriptsBlock
  );
} else if (/<\/body>/i.test(html)) {
  html = html.replace(/<\/body>/i, `    ${scriptsBlock}\n  </body>`);
} else {
  html += `\n${scriptsBlock}\n`;
}

// Boot placeholder so #root is never an empty black void while JS parses.
if (!/<div id="caval-boot"/.test(html)) {
  html = html.replace(
    /<div id="root"><\/div>/,
    `<div id="root"><div id="caval-boot" style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0E0E0F;color:#8A95A6;font:600 14px Inter,system-ui,sans-serif;letter-spacing:0.04em">CAVALLO se încarcă…</div></div>`
  );
}

fs.writeFileSync(target, html);
