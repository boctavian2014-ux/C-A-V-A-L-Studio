import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { parseIndexedFile } from "../../../src/main/workspace/workspace-indexer";
import {
  indexSingleFile,
  isIndexableRelativePath,
  scanWorkspace,
} from "../../../src/main/workspace/workspace-scan";
import {
  loadWorkspaceIndex,
  saveWorkspaceIndex,
  workspaceIndexPath,
} from "../../../src/main/workspace/workspace-index-store";
import { WorkspaceIndexService } from "../../../src/main/workspace/workspace-index-service";

describe("7d.1 workspace indexer", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function tempRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    roots.push(root);
    return root;
  }

  it("scans indexable files and excludes node_modules / .git / oversized", async () => {
    const root = tempRoot("caval-7d1-scan-");
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "node_modules", "pkg"), { recursive: true });
    fs.mkdirSync(path.join(root, ".git"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "src", "app.ts"),
      `import { x } from './x';\nexport function greet() {}\nexport class App {}\nexport interface Opts {}\nexport type Id = string;\nexport const VERSION = 1;\n`
    );
    fs.writeFileSync(
      path.join(root, "node_modules", "pkg", "index.ts"),
      `export function hidden() {}\n`
    );
    fs.writeFileSync(path.join(root, ".git", "hooks.ts"), `export const hook = 1;\n`);
    fs.writeFileSync(path.join(root, ".env"), `SECRET=1\n`);
    fs.writeFileSync(path.join(root, "huge.ts"), "x".repeat(600 * 1024));

    const index = await scanWorkspace(root);
    const paths = index.files.map((f) => f.path);
    expect(paths).toContain("src/app.ts");
    expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
    expect(paths.some((p) => p.includes(".git"))).toBe(false);
    expect(paths).not.toContain(".env");
    expect(paths).not.toContain("huge.ts");
    expect(index.totalFiles).toBe(1);
  });

  it("parses exported symbols and imports", () => {
    const file = parseIndexedFile(
      "lib/api.ts",
      [
        `import React from 'react';`,
        `import { foo } from './foo';`,
        `export async function runJob() {}`,
        `export class Runner {}`,
        `export interface Job {}`,
        `export type JobId = string;`,
        `export const MAX = 3;`,
        `export { helper as util };`,
      ].join("\n")
    );
    expect(file.imports).toEqual(expect.arrayContaining(["react", "./foo"]));
    expect(file.exports).toEqual(
      expect.arrayContaining(["runJob", "Runner", "Job", "JobId", "MAX", "util"])
    );
    expect(file.symbols.find((s) => s.name === "runJob")?.kind).toBe("function");
    expect(file.symbols.find((s) => s.name === "Runner")?.kind).toBe("class");
    expect(file.symbols.find((s) => s.name === "Job")?.kind).toBe("interface");
  });

  it("skips secret and lockfile paths", () => {
    expect(isIndexableRelativePath(".env.local")).toBe(false);
    expect(isIndexableRelativePath("package-lock.json")).toBe(false);
    expect(isIndexableRelativePath("src/ok.ts")).toBe(true);
  });

  it("persists and reloads index JSON", async () => {
    const root = tempRoot("caval-7d1-store-");
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "a.ts"), `export const A = 1;\n`);
    const scanned = await scanWorkspace(root);
    await saveWorkspaceIndex(root, scanned);
    expect(fs.existsSync(workspaceIndexPath(root))).toBe(true);
    const loaded = await loadWorkspaceIndex(root);
    expect(loaded?.totalFiles).toBe(1);
    expect(loaded?.files[0]?.exports).toContain("A");
  });

  it("service openWorkspace indexes and reindexes a single path", async () => {
    const root = tempRoot("caval-7d1-svc-");
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "one.ts"), `export function one() {}\n`);

    const service = new WorkspaceIndexService();
    await service.openWorkspace(root);
    const index = await service.waitUntilIdle();
    expect(index.files.some((f) => f.path === "src/one.ts")).toBe(true);

    fs.writeFileSync(
      path.join(root, "src", "two.ts"),
      `export function two() {}\nexport class Two {}\n`
    );
    await service.reindexPath("src/two.ts");
    expect(service.getIndex().files.some((f) => f.path === "src/two.ts")).toBe(true);
    expect(
      service.getIndex().files.find((f) => f.path === "src/two.ts")?.exports
    ).toEqual(expect.arrayContaining(["two", "Two"]));

    fs.unlinkSync(path.join(root, "src", "two.ts"));
    await service.reindexPath("src/two.ts");
    expect(service.getIndex().files.some((f) => f.path === "src/two.ts")).toBe(false);

    await service.close();
  });

  it("indexSingleFile returns null for oversized files", async () => {
    const root = tempRoot("caval-7d1-big-");
    fs.writeFileSync(path.join(root, "big.ts"), "y".repeat(600 * 1024));
    expect(await indexSingleFile(root, "big.ts")).toBeNull();
  });
});
