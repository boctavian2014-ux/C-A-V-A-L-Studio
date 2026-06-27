import { describe, expect, it } from "vitest";
import { resolveMcpSpawn } from "../../ai/mcp/mcp-client";

describe("resolveMcpSpawn", () => {
  it("uses npx.cmd on Windows", () => {
    if (process.platform !== "win32") return;
    const resolved = resolveMcpSpawn("npx", ["-y", "@modelcontextprotocol/server-fetch"], {});
    expect(resolved.command).toBe("npx.cmd");
    expect(resolved.args).toEqual(["-y", "@modelcontextprotocol/server-fetch"]);
  });

  it("keeps command unchanged on non-Windows", () => {
    if (process.platform === "win32") return;
    const resolved = resolveMcpSpawn("npx", ["-y", "pkg"], {});
    expect(resolved.command).toBe("npx");
  });
});
