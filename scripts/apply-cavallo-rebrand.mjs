#!/usr/bin/env node
/**
 * Branding text pass: CAVALO / Caval Studio / Cavallo → CAVALLO (display strings only).
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'release', 'fashion-matching-app']);
const SKIP_FILE_RE = /\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|map|lock)$/i;
const EXT_OK = /\.(ts|tsx|js|mjs|json|jsonc|html|md|svg|yml|yaml|plist|css)$/i;

const REPLACEMENTS = [
  [/\bCAVALO\b/g, 'CAVALLO'],
  [/\bCaval Studio\b/g, 'CAVALLO Studio'],
  [/\bCaval IDE\b/g, 'CAVALLO Studio'],
  [/\bCaval AI\b/g, 'CAVALLO AI'],
  [/\bCavallo\b/g, 'CAVALLO'],
  // Logo SVG wordmark only (not CavalConfig / caval.* paths)
  [/(<text[^>]*>)Caval(<\/text>)/g, '$1CAVALLO$2'],
  [/"Caval Ivory"/g, '"CAVALLO Ivory"'],
  [/"Caval Graphite"/g, '"CAVALLO Graphite"'],
];

function shouldSkipDir(name) {
  return SKIP_DIRS.has(name) || name.startsWith('.cavalo');
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'apply-cavallo-rebrand.mjs') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!shouldSkipDir(ent.name)) walk(full, out);
      continue;
    }
    if (!EXT_OK.test(ent.name) || SKIP_FILE_RE.test(ent.name)) continue;
    if (full.includes(`${path.sep}.cavalo${path.sep}pipeline${path.sep}`)) continue;
    out.push(full);
  }
  return out;
}

function apply(content) {
  let next = content;
  for (const [re, rep] of REPLACEMENTS) {
    next = next.replace(re, rep);
  }
  return next;
}

const files = walk(ROOT);
const changed = [];

for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const after = apply(before);
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    changed.push(path.relative(ROOT, file));
  }
}

console.log(`Rebrand: ${changed.length} files updated`);
for (const f of changed.sort()) console.log(`  ${f}`);
