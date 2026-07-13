import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { resolveMcpSpawn } from "../../ai/mcp/mcp-client";
import { mergeMcpServerEnv, mcpStartErrorHint } from "../../ai/mcp/mcp-env";

describe("resolveMcpSpawn", () => {
  it("uses npx.cmd on Windows", () => {
    if (process.platform !== "win32") return;
    const resolved = resolveMcpSpawn("npx", ["-y", "mcp-server-fetch"], {});
    expect(resolved.command).toBe("npx.cmd");
    expect(resolved.args).toEqual(["-y", "mcp-server-fetch"]);
  });

  it("resolves uvx to native executable on Windows", () => {
    if (process.platform !== "win32") return;
    const resolved = resolveMcpSpawn("uvx", ["mcp-server-git", "--repository", "."], {});
    expect(resolved.command).not.toBe("uvx.cmd");
    expect(resolved.command.toLowerCase()).toMatch(/uvx(\.exe)?$/);
    expect(resolved.env.PATH).toMatch(/\.local[\\/]+bin/i);
  });

  it("keeps command unchanged on non-Windows", () => {
    if (process.platform === "win32") return;
    const resolved = resolveMcpSpawn("npx", ["-y", "pkg"], {});
    expect(resolved.command).toBe("npx");
  });
});

describe("mergeMcpServerEnv", () => {
  const originalFirecrawl = process.env.FIRECRAWL_API_KEY;

  beforeEach(() => {
    process.env.FIRECRAWL_API_KEY = "from-process";
  });

  afterEach(() => {
    if (originalFirecrawl === undefined) delete process.env.FIRECRAWL_API_KEY;
    else process.env.FIRECRAWL_API_KEY = originalFirecrawl;
  });

  it("ignores blank config env values so process.env is preserved", () => {
    const env = mergeMcpServerEnv({ FIRECRAWL_API_KEY: "" });
    expect(env.FIRECRAWL_API_KEY).toBe("from-process");
  });

  it("prefers non-empty config env over process.env", () => {
    const env = mergeMcpServerEnv({ FIRECRAWL_API_KEY: "from-config" });
    expect(env.FIRECRAWL_API_KEY).toBe("from-config");
  });

  it("injects secrets when config env is absent", () => {
    const env = mergeMcpServerEnv(undefined, { FIRECRAWL_API_KEY: "from-secrets" });
    expect(env.FIRECRAWL_API_KEY).toBe("from-secrets");
  });

  it("injects GITHUB_PERSONAL_ACCESS_TOKEN from secrets", () => {
    const env = mergeMcpServerEnv(
      { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
      { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_test_token" }
    );
    expect(env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe("ghp_test_token");
  });

  it("injects SEMGREP_APP_TOKEN from secrets when config blank", () => {
    const env = mergeMcpServerEnv(
      { SEMGREP_APP_TOKEN: "" },
      { SEMGREP_APP_TOKEN: "sgp_test" }
    );
    expect(env.SEMGREP_APP_TOKEN).toBe("sgp_test");
  });
});

describe("mcpStartErrorHint", () => {
  it("suggests fetch via uvx", () => {
    const hint = mcpStartErrorHint("fetch", "uvx: command not found");
    expect(hint).toMatch(/uvx mcp-server-fetch/i);
  });

  it("suggests git init when workspace is not a repo", () => {
    const hint = mcpStartErrorHint("git", "C:\\proj is not a valid Git repository");
    expect(hint).toMatch(/git init/i);
  });

  it("suggests uv for git E404 errors", () => {
    const hint = mcpStartErrorHint("git", "npm ERR! 404 Not Found");
    expect(hint).toMatch(/uv/i);
  });

  it("suggests Docker for github spawn failures", () => {
    const hint = mcpStartErrorHint("github", "docker: command not found");
    expect(hint).toMatch(/docker/i);
  });

  it("suggests PAT for github auth failures", () => {
    const hint = mcpStartErrorHint("github", "401 Unauthorized");
    expect(hint).toMatch(/GITHUB_PERSONAL_ACCESS_TOKEN/i);
  });

  it("suggests uvx for semgrep errors", () => {
    const hint = mcpStartErrorHint("semgrep", "uvx: command not found");
    expect(hint).toMatch(/semgrep/i);
  });

  it("suggests trivy plugin for trivy mcp errors", () => {
    const hint = mcpStartErrorHint("trivy", "unknown command: mcp");
    expect(hint).toMatch(/trivy plugin install mcp/i);
  });
});

/**
 * Manual verification (Extensions + MCP):
 * 1. Open a folder with caval.jsonc → Extensions → MCP → Health shows tools for filesystem/fetch/memory.
 * 2. Git shows tools if uvx is installed, else a clear hint (not npm E404).
 * 3. App launch auto-starts marketplace — Extensions tab lists Romania Tools without npm run marketplace:serve.
 * 4. Install extension → .cavalo/extensions/<id>/package.json; reload → appears under Instalate.
 */
