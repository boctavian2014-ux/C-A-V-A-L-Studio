import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createIpcHarness } from "./ipc-harness";

const harness = createIpcHarness();

const mcpMocks = vi.hoisted(() => ({
  loadFromConfig: vi.fn(),
  list: vi.fn().mockReturnValue([
    { id: "fetch", name: "MCP Fetch", running: false, transport: "stdio" },
  ]),
  start: vi.fn().mockResolvedValue({ serverId: "fetch", running: true }),
  stop: vi.fn(),
  callTool: vi.fn().mockResolvedValue({ ok: true, output: { body: "mock-response" } }),
}));

const aiMocks = vi.hoisted(() => ({
  complete: vi.fn().mockResolvedValue({
    content: ".then(res => res.json())",
    model: "north-mini-code",
    provider: "test",
    latencyMs: 1,
  }),
}));

vi.mock("electron", () => ({
  ipcMain: harness.ipcMain,
}));

vi.mock("../../ai/mcp/mcp-client", () => ({
  mcpManager: mcpMocks,
}));

vi.mock("../../ai/ai-client", () => ({
  AIClient: class {
    complete = aiMocks.complete;
  },
}));

describe("MCP IPC integration", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    harness.reset();
    vi.resetModules();
    mcpMocks.loadFromConfig.mockClear();
    mcpMocks.list.mockClear();
    mcpMocks.start.mockClear();
    mcpMocks.stop.mockClear();
    mcpMocks.callTool.mockClear();
    aiMocks.complete.mockClear();

    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "caval-mcp-ipc-"));
    await fs.writeFile(path.join(workspaceRoot, "sample.ts"), "export const x = 1;\n", "utf8");
    await fs.writeFile(
      path.join(workspaceRoot, "caval.jsonc"),
      JSON.stringify({ autocomplete: { enabled: true, model: "north-mini-code" } }),
      "utf8"
    );

    const { registerMcpHandlers } = await import("../../src/main/mcp-handlers");
    registerMcpHandlers(() => workspaceRoot);
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("caval:mcp-list loads config and returns servers", async () => {
    const result = await harness.invoke<{ ok: boolean; servers: Array<{ id: string }> }>("caval:mcp-list");
    expect(result.ok).toBe(true);
    expect(result.servers.some((s) => s.id === "fetch")).toBe(true);
    expect(mcpMocks.loadFromConfig).toHaveBeenCalled();
  });

  it("caval:mcp-start and caval:mcp-stop manage server lifecycle", async () => {
    const started = await harness.invoke<{ ok: boolean; status: { running: boolean } }>(
      "caval:mcp-start",
      "fetch"
    );
    expect(started.ok).toBe(true);
    expect(started.status.running).toBe(true);
    expect(mcpMocks.start).toHaveBeenCalledWith("fetch", workspaceRoot);

    const stopped = await harness.invoke<{ ok: boolean }>("caval:mcp-stop", "fetch");
    expect(stopped.ok).toBe(true);
    expect(mcpMocks.stop).toHaveBeenCalledWith("fetch");
  });

  it("caval:tool-execute reads a workspace file", async () => {
    const result = await harness.invoke<{ ok: boolean; output?: { content: string } }>(
      "caval:tool-execute",
      { name: "read_file", arguments: { path: "sample.ts" } }
    );
    expect(result.ok).toBe(true);
    expect(result.output?.content).toContain("export const x");
  });

  it("caval:tool-execute routes mcp-prefixed tools through mcpManager", async () => {
    const result = await harness.invoke<{ ok: boolean; output?: unknown }>("caval:tool-execute", {
      name: "mcp:fetch:get",
      arguments: { url: "https://example.com" },
    });
    expect(result.ok).toBe(true);
    expect(mcpMocks.callTool).toHaveBeenCalledWith("fetch", "get", { url: "https://example.com" });
  });

  it("caval:autocomplete returns model completion text", async () => {
    const result = await harness.invoke<{ ok: boolean; suggestion: string }>("caval:autocomplete", {
      prefix: "fetch(",
      filePath: "sample.ts",
      language: "typescript",
    });
    expect(result.ok).toBe(true);
    expect(result.suggestion).toContain(".then");
    expect(aiMocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ capability: "autocomplete", intent: "autocomplete" })
    );
  });

  it("caval:autocomplete returns empty suggestion when disabled in config", async () => {
    await fs.writeFile(
      path.join(workspaceRoot, "caval.jsonc"),
      JSON.stringify({ autocomplete: { enabled: false } }),
      "utf8"
    );

    const result = await harness.invoke<{ ok: boolean; suggestion: string }>("caval:autocomplete", {
      prefix: "const ",
      filePath: "sample.ts",
      language: "typescript",
    });
    expect(result.ok).toBe(true);
    expect(result.suggestion).toBe("");
    expect(aiMocks.complete).not.toHaveBeenCalled();
  });
});
