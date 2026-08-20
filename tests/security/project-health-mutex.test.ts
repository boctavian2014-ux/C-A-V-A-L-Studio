import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeWorkspaceRoot } from "../../src/main/path-security";

const commandMock = vi.hoisted(() => ({
  runAllowedWorkspaceCommand: vi.fn(),
}));

vi.mock("../../ai/tools/workspace-command-runner", () => ({
  runAllowedWorkspaceCommand: commandMock.runAllowedWorkspaceCommand,
}));

describe("project-health execute mutex (per workspace)", () => {
  let tmpA = "";
  let tmpB = "";

  beforeEach(async () => {
    commandMock.runAllowedWorkspaceCommand.mockReset();
    commandMock.runAllowedWorkspaceCommand.mockResolvedValue({
      command: "npm run typecheck",
      ok: true,
      exitCode: 0,
      output: "ok",
    });

    tmpA = fs.mkdtempSync(path.join(os.tmpdir(), "caval-ha-"));
    tmpB = fs.mkdtempSync(path.join(os.tmpdir(), "caval-hb-"));
    fs.writeFileSync(
      path.join(tmpA, "package.json"),
      JSON.stringify({ name: "a", scripts: { typecheck: "echo a" } })
    );
    fs.writeFileSync(
      path.join(tmpB, "package.json"),
      JSON.stringify({ name: "b", scripts: { typecheck: "echo b" } })
    );

    const { clearProjectHealthExecuteLocks } = await import("../../ai/tools/project-health-runner.js");
    clearProjectHealthExecuteLocks();
  });

  afterEach(() => {
    fs.rmSync(tmpA, { recursive: true, force: true });
    fs.rmSync(tmpB, { recursive: true, force: true });
  });

  it("allows concurrent execute on different workspace roots", async () => {
    const { runProjectHealthSnapshot, isProjectHealthExecuteInFlight } = await import(
      "../../ai/tools/project-health-runner.js"
    );

    const p1 = runProjectHealthSnapshot(tmpA, { execute: true });
    const p2 = runProjectHealthSnapshot(tmpB, { execute: true });
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1.packageName).toBe("a");
    expect(r2.packageName).toBe("b");
    expect(isProjectHealthExecuteInFlight(tmpA)).toBe(false);
    expect(isProjectHealthExecuteInFlight(tmpB)).toBe(false);
  });

  it("blocks concurrent execute on the same workspace root", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    commandMock.runAllowedWorkspaceCommand.mockImplementation(async () => {
      await gate;
      return { command: "npm run typecheck", ok: true, exitCode: 0, output: "ok" };
    });

    const { runProjectHealthSnapshot, isProjectHealthExecuteInFlight } = await import(
      "../../ai/tools/project-health-runner.js"
    );

    const first = runProjectHealthSnapshot(tmpA, { execute: true });
    // Allow first job to set the mutex
    await Promise.resolve();
    expect(isProjectHealthExecuteInFlight(normalizeWorkspaceRoot(tmpA))).toBe(true);

    await expect(runProjectHealthSnapshot(tmpA, { execute: true })).rejects.toThrow(
      /already in progress for this workspace/i
    );

    release();
    await first;
    expect(isProjectHealthExecuteInFlight(tmpA)).toBe(false);
  });
});
