import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const IMPORT_RE = /from\s+["']([^"']+)["']/g;

const HOST_BOOT_FILES = [
  "src/shared/command-output-redaction.ts",
  "src/main/subprocess-env.ts",
  "src/main/path-security.ts",
  "ai/tools/workspace-execute-lock.ts",
] as const;

function posixRel(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

function resolveImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.js`,
    path.join(base, "index.ts"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function localImportSpecs(source: string): string[] {
  return [...source.matchAll(IMPORT_RE)].map((match) => match[1]);
}

function walkLocalImports(root: string, entry: string): string[] {
  const seen = new Set<string>();
  const queue = [path.resolve(root, entry)];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    const source = fs.readFileSync(file, "utf8");
    for (const spec of localImportSpecs(source)) {
      const resolved = resolveImport(file, spec);
      if (resolved) queue.push(resolved);
    }
  }
  return [...seen];
}

function copiedIntoImage(dockerfile: string): { files: string[]; dirs: string[] } {
  const files: string[] = [];
  const dirs: string[] = [];
  for (const raw of dockerfile.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("COPY ")) continue;
    const parts = line.slice("COPY ".length).split(/\s+/);
    if (parts.length < 2) continue;
    const dest = parts[parts.length - 1].replace(/^\.\//, "");
    const sources = parts.slice(0, -1);
    const destIsDir = dest.endsWith("/") || sources.length > 1;
    for (const source of sources) {
      const src = source.replace(/^\.\//, "");
      if (destIsDir) {
        const destDir = dest.endsWith("/") ? dest : `${dest}/`;
        files.push(`${destDir}${path.posix.basename(src)}`);
      } else {
        files.push(dest);
      }
      if (!src.includes(".") && !src.endsWith(".ts")) dirs.push(src.replace(/\/$/, ""));
    }
  }
  return { files, dirs };
}

describe("CAD Dockerfile packaging", () => {
  const root = process.cwd();
  const dockerfile = fs.readFileSync(
    path.join(root, "engineering/cad-server/Dockerfile"),
    "utf8"
  );
  const copied = copiedIntoImage(dockerfile);

  it("copies the boot import chain onto the paths CAD resolves at runtime", () => {
    for (const rel of HOST_BOOT_FILES) {
      expect(fs.existsSync(path.join(root, rel))).toBe(true);
      expect(copied.files).toContain(rel);
    }
    expect(dockerfile).not.toMatch(/^COPY \. \./m);
  });

  it("does not copy the whole repository into the CAD image", () => {
    const copyLines = dockerfile
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("COPY "));
    expect(copyLines.some((line) => line === "COPY . ." || line === "COPY . ./")).toBe(
      false
    );
  });

  it("keeps host boot modules free of extra local imports outside the COPY set", () => {
    const allowed = new Set(HOST_BOOT_FILES);
    for (const rel of HOST_BOOT_FILES) {
      const abs = path.join(root, rel);
      const source = fs.readFileSync(abs, "utf8");
      for (const spec of localImportSpecs(source)) {
        if (!spec.startsWith(".")) continue;
        const resolved = resolveImport(abs, spec);
        expect(resolved, `${rel} imports ${spec}`).toBeTruthy();
        expect(allowed.has(posixRel(root, resolved!))).toBe(true);
      }
    }
    const lockSource = fs.readFileSync(
      path.join(root, "ai/tools/workspace-execute-lock.ts"),
      "utf8"
    );
    expect(lockSource).not.toMatch(/from\s+["']\.\.\/\.\.\/ai\//);
    expect(lockSource).toMatch(/from\s+["']\.\.\/\.\.\/src\/main\/path-security["']/);
  });

  it("copies every local module reachable from CAD standalone boot", () => {
    const reachable = walkLocalImports(root, "engineering/cad-server/standalone.ts");
    const missing = reachable
      .map((file) => posixRel(root, file))
      .filter((rel) => {
        if (copied.files.includes(rel)) return false;
        return !copied.dirs.some((dir) => rel === dir || rel.startsWith(`${dir}/`));
      });
    expect(missing).toEqual([]);
  });
});
