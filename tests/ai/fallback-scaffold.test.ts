/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyFallbackScaffold,
  getMinimalExpressScaffoldFiles,
  getMinimalViteReactScaffoldFiles,
  workspaceHasRunnableWebProject,
} from "../../ai/composer/fallback-scaffold";
import { projectNameFromPrompt } from "../../src/renderer/hooks/project-name-from-prompt";

describe("fallback-scaffold", () => {
  const filesOnDisk = new Map<string, string>();

  beforeEach(() => {
    filesOnDisk.clear();
    (window as unknown as { caval: unknown }).caval = {
      workspaceSync: vi.fn(async () => ({ ok: true, path: "C:\\proj" })),
      fs: {
        createDir: vi.fn(async () => ({ ok: true })),
        writeFile: vi.fn(async (filePath: string, content: string) => {
          filesOnDisk.set(filePath.replace(/\\/g, "/").toLowerCase(), content);
          return { ok: true };
        }),
        readFile: vi.fn(async (filePath: string) => {
          const key = filePath.replace(/\\/g, "/").toLowerCase();
          const content = filesOnDisk.get(key);
          if (content != null) return { ok: true, content };
          return { ok: false, error: "missing" };
        }),
      },
    };
  });

  afterEach(() => {
    delete (window as unknown as { caval?: unknown }).caval;
  });

  it("writes Vite scaffold when empty", async () => {
    const result = await applyFallbackScaffold("C:\\proj");
    expect(result.written).toContain("package.json");
    expect(getMinimalViteReactScaffoldFiles()[0]?.content).toContain('"dev": "vite"');
    const indexHtml = getMinimalViteReactScaffoldFiles().find((f) => f.path === "index.html");
    expect(indexHtml?.content).toContain("cdn.tailwindcss.com");
    expect(indexHtml?.content).toMatch(/fonts\.googleapis\.com.*Inter/s);
  });

  it("writes Express package.json when src/index.ts imports express", async () => {
    filesOnDisk.set(
      "c:/proj/src/index.ts",
      "import express from 'express';\nconst app = express();\napp.listen(3000);\n"
    );
    const result = await applyFallbackScaffold("C:\\proj", { projectName: "api" });
    expect(result.written).toContain("package.json");
    expect(result.written).toContain("caval.jsonc");
    expect(result.written).not.toContain("src/App.tsx");
    const pkg = filesOnDisk.get("c:/proj/package.json") ?? "";
    expect(pkg).toContain("tsx watch");
    expect(pkg).toContain("express");
    expect(getMinimalExpressScaffoldFiles("api").some((f) => f.path === "caval.jsonc")).toBe(
      true
    );
    expect(await workspaceHasRunnableWebProject("C:\\proj")).toBe(true);
  });

  it("skips when scripts.dev already exists", async () => {
    filesOnDisk.set(
      "c:/proj/package.json",
      JSON.stringify({ scripts: { dev: "vite" } })
    );
    const result = await applyFallbackScaffold("C:\\proj");
    expect(result.skippedBecauseExisting).toBe(true);
  });
});

describe("projectNameFromPrompt", () => {
  it("does not use SCAFFOLD_CONTINUE as a Desktop folder name", () => {
    expect(
      projectNameFromPrompt(
        "SCAFFOLD_CONTINUE\n\nContinuă implementarea din planul anterior. Nu repeta."
      )
    ).toBe("Caval-Project");
  });
});
