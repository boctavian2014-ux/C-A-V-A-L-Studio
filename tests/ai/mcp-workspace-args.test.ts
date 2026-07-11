import { describe, expect, it } from "vitest";
import { resolveMcpServerArgs } from "../../ai/mcp/mcp-workspace-args";

describe("mcp-workspace-args", () => {
  it("replaces standalone dot args with workspace root", () => {
    const root = "C:\\Users\\demo\\project";
    expect(resolveMcpServerArgs(["-y", "@modelcontextprotocol/server-filesystem", "."], root)).toEqual([
      "-y",
      "@modelcontextprotocol/server-filesystem",
      root,
    ]);
  });

  it("replaces --repository . pair for git server", () => {
    const root = "/home/user/app";
    const resolved = resolveMcpServerArgs(["-y", "server-git", "--repository", "."], root);
    expect(resolved[0]).toBe("-y");
    expect(resolved[1]).toBe("server-git");
    expect(resolved[2]).toBe("--repository");
    expect(resolved[3]).toContain("app");
  });
});
