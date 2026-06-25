import { describe, expect, it, vi, beforeEach } from "vitest";
import { createIpcHarness } from "./ipc-harness";

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  dialog: {},
  BrowserWindow: {},
}));

describe("schematic IPC", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("registers schematic handlers and returns sample graph", async () => {
    const { ipcMain } = await import("electron");
    const harness = createIpcHarness();
    (ipcMain.handle as ReturnType<typeof vi.fn>).mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        harness.handlers.set(channel, handler as never);
      }
    );

    const { registerSchematicHandlers } = await import("../../src/main/schematic-handlers");
    registerSchematicHandlers();

    const result = await harness.invoke<{ ok: boolean; graph?: { nodes: unknown[] } }>(
      "schematic:generateFromCode",
      { workspaceRoot: ".", useSample: true }
    );

    expect(result.ok).toBe(true);
    expect(result.graph?.nodes?.length).toBeGreaterThan(0);
  });
});
