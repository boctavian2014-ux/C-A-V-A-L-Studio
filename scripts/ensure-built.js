const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const mainFile = path.join(distDir, 'main', 'electron-main.js');

console.log('[ensure-built.js] Checking if dist/ exists...');

if (!fs.existsSync(distDir)) {
  console.error('[ensure-built.js] ERROR: dist/ directory not found. Run npm run build first.');
  process.exit(1);
}

console.log('[ensure-built.js] dist/ found.');

if (!fs.existsSync(mainFile)) {
  console.error(`[ensure-built.js] ERROR: ${mainFile} not found. Run npm run build first.`);
  process.exit(1);
}

console.log(`[ensure-built.js] ${mainFile} found.`);
console.log('[ensure-built.js] Build verified.');