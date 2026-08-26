/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyScaffoldToWorkspace } from "../../ai/composer/scaffold-apply";

describe("applyScaffoldToWorkspace", () => {
  beforeEach(() => {
    (window as unknown as { caval: unknown }).caval = {
      workspaceSync: vi.fn(async () => ({ ok: true, path: "C:\\proj" })),
      fs: {
        createDir: vi.fn(async () => ({ ok: true })),
        writeFile: vi.fn(async () => ({ ok: true })),
      },
    };
  });

  afterEach(() => {
    delete (window as unknown as { caval?: unknown }).caval;
  });

  it("writes absolute paths under project root", async () => {
    const result = await applyScaffoldToWorkspace("C:\\proj", [
      { path: "src/index.ts", content: "export {};\n" },
    ]);
    expect(result.written).toEqual(["src/index.ts"]);
    expect(result.errors).toEqual([]);
    const caval = (window as unknown as { caval: { fs: { writeFile: ReturnType<typeof vi.fn> } } })
      .caval;
    expect(caval.fs.writeFile).toHaveBeenCalledWith(
      "C:\\proj\\src\\index.ts",
      "export {};\n"
    );
  });

  it("skips internal workspace metadata paths", async () => {
    const result = await applyScaffoldToWorkspace("C:\\proj", [
      { path: ".caval/context-cache/documents.json", content: "{}\n" },
      { path: ".cavalo/ai/history.db", content: "x" },
      { path: "index.html", content: "<html></html>\n" },
    ]);
    expect(result.written).toEqual(["index.html"]);
    expect(result.skipped).toBe(2);
  });

  it("surfaces workspace sync failure", async () => {
    (window as unknown as { caval: { workspaceSync: ReturnType<typeof vi.fn> } }).caval.workspaceSync =
      vi.fn(async () => ({ ok: false, error: "denied" }));
    const result = await applyScaffoldToWorkspace("C:\\proj", [
      { path: "a.ts", content: "x" },
    ]);
    expect(result.written).toEqual([]);
    expect(result.errors[0]).toContain("denied");
  });
});
