#!/usr/bin/env node
/**
 * Apply TS2835 (.js extension) only where tsc reports it.
 *
 * Unlike a blanket sed, this:
 * - handles ./ and ../
 * - does not rewrite import type / node_modules / absolute specifiers
 *   unless tsc itself reported them (it will not for node_modules/absolutes)
 * - does not double-append .js
 *
 * Usage:
 *   node scripts/fix-ts2835.mjs tests/security
 *   node scripts/fix-ts2835.mjs tests/ai --tsconfig tsconfig.diag.json
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
const dryRun = process.argv.includes("--dry-run");
const tsconfigIdx = args.indexOf("--tsconfig");
const tsconfig =
  tsconfigIdx >= 0 ? args[tsconfigIdx + 1] : "tsconfig.diag.json";
const targetDir = (tsconfigIdx >= 0 ? args.filter((_, i) => i !== tsconfigIdx && i !== tsconfigIdx + 1)[0] : args[0])
  ?? "tests/security";

const targetPrefix = targetDir.replaceAll("\\", "/").replace(/\/$/, "");

if (!fs.existsSync(tsconfig)) {
  console.error(`Missing ${tsconfig}. Create a diagnostic tsconfig that includes tests/ first.`);
  process.exit(1);
}

console.log(`Scanning TS2835 under ${targetPrefix} via ${tsconfig}...`);

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  npx,
  ["tsc", "--noEmit", "--pretty", "false", "-p", tsconfig],
  {
    encoding: "utf8",
    shell: false,
    maxBuffer: 32 * 1024 * 1024,
  }
);

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const ts2835 =
  /^(?<file>.+?)\(\d+,\d+\): error TS2835: .*Did you mean '(?<suggested>[^']+)'\?/gm;

/** @type {Map<string, Set<string>>} */
const byFile = new Map();
let match;
while ((match = ts2835.exec(output))) {
  const file = match.groups.file.replaceAll("\\", "/");
  const suggested = match.groups.suggested;
  const rel = file.replaceAll("\\", "/");
  if (rel !== targetPrefix && !rel.startsWith(`${targetPrefix}/`)) continue;
  if (!suggested.startsWith(".")) continue;
  if (!suggested.endsWith(".js")) continue;
  const list = byFile.get(file) ?? new Set();
  list.add(suggested);
  byFile.set(file, list);
}

if (byFile.size === 0) {
  console.log("No TS2835 hits in target. Nothing to rewrite.");
  process.exit(0);
}

let filesChanged = 0;
let replacements = 0;

for (const [file, suggestedSet] of byFile) {
  const abs = path.resolve(file);
  let source = fs.readFileSync(abs, "utf8");
  const original = source;

  for (const suggested of suggestedSet) {
    const withoutJs = suggested.slice(0, -".js".length);
    if (withoutJs.endsWith(".js") || /\.(json|mjs|cjs|node|css|svg)$/.test(withoutJs)) {
      continue;
    }
    const quoted = [
      [`'${withoutJs}'`, `'${suggested}'`],
      [`"${withoutJs}"`, `"${suggested}"`],
    ];
    for (const [from, to] of quoted) {
      if (!source.includes(from)) continue;
      const next = source.split(from).join(to);
      if (next !== source) {
        const count = source.split(from).length - 1;
        replacements += count;
        source = next;
      }
    }
  }

  if (source === original) {
    console.log(`No specifier text matched in ${file}`);
    continue;
  }
  filesChanged += 1;
  console.log(`${dryRun ? "Would update" : "Updated"}: ${file}`);
  if (!dryRun) fs.writeFileSync(abs, source, "utf8");
}

console.log(
  `${dryRun ? "Dry run. " : ""}Files ${dryRun ? "matched" : "changed"}: ${filesChanged}. Specifier replacements: ${replacements}.`
);
