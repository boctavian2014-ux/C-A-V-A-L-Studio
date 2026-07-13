import { describe, expect, it } from "vitest";

import {
  DEFAULT_CAVAL_CONFIG,
} from "../../ai/modes/agent-modes";
import {
  loadCavalConfig,
  resolveCavalConfigSearchPaths,
  setCavalConfigExtraPaths,
} from "../../ai/config/caval-config";

describe("caval-config paths", () => {
  it("DEFAULT_CAVAL_CONFIG includes bundled MCP servers", () => {
    const ids = DEFAULT_CAVAL_CONFIG.mcp?.servers?.map((s) => s.id) ?? [];
    expect(ids).toContain("filesystem");
    expect(ids).toContain("git");
    expect(ids).toContain("fetch");
    expect(ids).toContain("memory");
    expect(ids).toContain("github");
    expect(ids).toContain("semgrep");
    expect(ids).toContain("trivy");
    expect(ids.length).toBeGreaterThanOrEqual(9);
  });

  it("resolveCavalConfigSearchPaths includes workspace, cwd, and extra paths", () => {
    setCavalConfigExtraPaths(["C:\\fake\\app"]);
    const paths = resolveCavalConfigSearchPaths("D:\\workspace");
    expect(paths[0]).toContain("D:\\workspace");
    expect(paths.some((p) => p.includes("caval.jsonc"))).toBe(true);
    expect(paths.some((p) => p.includes("fake"))).toBe(true);
    setCavalConfigExtraPaths([]);
  });

  it("loadCavalConfig falls back to DEFAULT_CAVAL_CONFIG with MCP servers", async () => {
    const config = await loadCavalConfig("/nonexistent/workspace");
    expect((config.mcp?.servers?.length ?? 0)).toBeGreaterThanOrEqual(4);
  });
});
