import { describe, expect, it } from "vitest";
import { mcpToolId, parseMcpToolId } from "../../ai/mcp/mcp-tool-names";

describe("mcp-tool-names", () => {
  it("builds and parses mcp tool ids", () => {
    const id = mcpToolId("fetch", "fetch_url");
    expect(id).toBe("mcp:fetch:fetch_url");
    expect(parseMcpToolId(id)).toEqual({ serverId: "fetch", toolName: "fetch_url" });
  });

  it("returns null for non-mcp ids", () => {
    expect(parseMcpToolId("read_file")).toBeNull();
  });
});
