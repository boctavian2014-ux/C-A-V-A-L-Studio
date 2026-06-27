import { beforeEach, describe, expect, it, vi } from "vitest";
import { createIpcHarness } from "./ipc-harness";

const harness = createIpcHarness();

vi.mock("electron", () => ({
  ipcMain: harness.ipcMain,
}));

describe("schematic IPC", () => {
  beforeEach(() => {
    harness.reset();
    vi.resetModules();
  });

  it("registers schematic handlers and returns sample graph", async () => {
    const { registerSchematicHandlers } = await import("../../src/main/schematic-handlers");
    registerSchematicHandlers(() => "/mock/workspace");

    const result = await harness.invoke<{ ok: boolean; graph?: { nodes: unknown[] } }>(
      "schematic:generateFromCode",
      { useSample: true }
    );

    expect(result.ok).toBe(true);
    expect(result.graph?.nodes?.length).toBeGreaterThan(0);
  });

  it("resolves workspace from sender when omitted", async () => {
    const { registerSchematicHandlers } = await import("../../src/main/schematic-handlers");
    registerSchematicHandlers((id) =>
      id === harness.sender.id ? "/sender/workspace" : process.cwd()
    );

    const result = await harness.invoke<{
      ok: boolean;
      graph?: { source?: { workspaceRoot?: string } };
    }>("schematic:generateFromCode", { useSample: true });

    expect(result.ok).toBe(true);
    expect(result.graph?.source?.workspaceRoot).toBe("/sender/workspace");
  });

  it("ignores workspaceRoot '.' and uses sender workspace", async () => {
    const { registerSchematicHandlers } = await import("../../src/main/schematic-handlers");
    registerSchematicHandlers(() => "/resolved/from/sender");

    const result = await harness.invoke<{
      ok: boolean;
      graph?: { source?: { workspaceRoot?: string } };
    }>("schematic:generateFromCode", { useSample: true, workspaceRoot: "." });

    expect(result.ok).toBe(true);
    expect(result.graph?.source?.workspaceRoot).toBe("/resolved/from/sender");
  });
});
