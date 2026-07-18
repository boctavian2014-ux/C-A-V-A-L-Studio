const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const rendererDir = path.join(distDir, 'renderer');

console.log('[prune-renderer-bundle.js] Pruning renderer bundle...');

if (!fs.existsSync(rendererDir)) {
  fs.mkdirSync(rendererDir, { recursive: true });
}

const bundleDir = path.join(rendererDir, 'bundle');
if (fs.existsSync(bundleDir)) {
  fs.rmSync(bundleDir, { recursive: true, force: true });
  console.log('[prune-renderer-bundle.js] Removed old bundle directory');
}

const staleFiles = [
  'workbench-app.js',
  'workbench-app.js.map',
  'workbench-app.js.LICENSE.txt',
  'monaco.js',
  'monaco.js.map',
  'monaco.js.LICENSE.txt',
];

for (const name of staleFiles) {
  const filePath = path.join(rendererDir, name);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`[prune-renderer-bundle.js] Removed stale renderer bundle: ${name}`);
  }
}

console.log('[prune-renderer-bundle.js] Done.');
