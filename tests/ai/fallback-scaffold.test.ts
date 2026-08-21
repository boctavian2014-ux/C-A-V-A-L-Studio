/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyFallbackScaffold,
  buildFallbackScaffoldTimelineEvent,
  FALLBACK_SCAFFOLD_TIMELINE_LABEL,
  FALLBACK_SCAFFOLD_TOAST,
  getMinimalViteReactScaffoldFiles,
  workspaceHasCodeFiles,
} from "../../ai/composer/fallback-scaffold";

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

  it("exposes the six Vite+React template files", () => {
    const files = getMinimalViteReactScaffoldFiles("My Shop");
    expect(files.map((f) => f.path).sort()).toEqual(
      [
        "index.html",
        "package.json",
        "src/App.tsx",
        "src/main.tsx",
        "tsconfig.json",
        "vite.config.ts",
      ].sort()
    );
    expect(files.find((f) => f.path === "package.json")?.content).toContain('"vite"');
    expect(FALLBACK_SCAFFOLD_TOAST).toContain("scaffold minim");
  });

  it("writes scaffold when stream left no code files", async () => {
    const result = await applyFallbackScaffold("C:\\proj");
    expect(result.skippedBecauseExisting).toBe(false);
    expect(result.errors).toEqual([]);
    expect(result.written.sort()).toEqual(
      [
        "package.json",
        "index.html",
        "src/main.tsx",
        "src/App.tsx",
        "vite.config.ts",
        "tsconfig.json",
      ].sort()
    );
  });

  it("skips fallback when AI already wrote package.json", async () => {
    filesOnDisk.set("c:/proj/package.json", '{"name":"from-ai"}');
    const result = await applyFallbackScaffold("C:\\proj");
    expect(result.skippedBecauseExisting).toBe(true);
    expect(result.written).toEqual([]);
    expect(await workspaceHasCodeFiles("C:\\proj")).toBe(true);
  });

  it("builds timeline event for UI", () => {
    const event = buildFallbackScaffoldTimelineEvent();
    expect(event.type).toBe("file_write");
    expect(event.label).toBe(FALLBACK_SCAFFOLD_TIMELINE_LABEL);
    expect(event.success).toBe(true);
  });
});
