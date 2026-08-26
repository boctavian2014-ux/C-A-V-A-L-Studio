import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildAgenticRepairMessage } from "../../ai/prompts/agentic-repair";
import {
  applyTrustedWriteGate,
  ToolRegistry,
} from "../../ai/tools/tool-registry";
import {
  allowsDiskWrites,
  allowsProposedOrWritePipeline,
  resolveExecutionMode,
  resolveTrustedExecutionCapability,
  shouldAllowChatApplyAccept,
  shouldGrantChatWriteTurn,
  stricterExecutionMode,
} from "../../ai/modes/execution-mode";

const WRITE_ARGS = {
  name: "write_file" as const,
  arguments: { path: "src/pwn.ts", content: "export const pwn = 1;\n" },
};

async function tempRegistry(): Promise<{ root: string; registry: ToolRegistry }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "caval-write-cap-"));
  return { root, registry: new ToolRegistry(root) };
}

describe("main-owned write capability gate", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it("explain + spoofed renderer APPLY_EDIT does not grant write_file", async () => {
    const { root, registry } = await tempRegistry();
    roots.push(root);
    const capability = resolveTrustedExecutionCapability({
      userMessage: "explică index.html",
      rendererRequestedMode: "APPLY_EDIT",
    });
    expect(capability.mainResolved).toBe("READ_ONLY");
    expect(capability.effective).toBe("READ_ONLY");
    expect(shouldGrantChatWriteTurn(capability)).toBe(false);
    expect(applyTrustedWriteGate(registry, "stream-explain", capability)).toBe("blocked");
    expect(registry.grantedWriteTurnId()).toBeNull();

    const result = await registry.execute(WRITE_ARGS, { turnId: "stream-explain" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/capability/i);
    await expect(fs.stat(path.join(root, "src", "pwn.ts"))).rejects.toThrow();
  });

  it("explain + spoofed AGENTIC_REPAIR does not grant writes or enter scaffold pipeline", async () => {
    const { root, registry } = await tempRegistry();
    roots.push(root);
    const capability = resolveTrustedExecutionCapability({
      userMessage: "ce face index.html?",
      rendererRequestedMode: "AGENTIC_REPAIR",
    });
    expect(capability.mainResolved).toBe("READ_ONLY");
    expect(capability.effective).toBe("READ_ONLY");
    expect(shouldGrantChatWriteTurn(capability)).toBe(false);
    expect(allowsProposedOrWritePipeline(capability.effective)).toBe(false);
    expect(applyTrustedWriteGate(registry, "stream-repair-spoof", capability)).toBe("blocked");

    const result = await registry.execute(WRITE_ARGS, { turnId: "stream-repair-spoof" });
    expect(result.ok).toBe(false);
    await expect(fs.stat(path.join(root, "src", "pwn.ts"))).rejects.toThrow();
  });

  it("SCAFFOLD create-and-write grants write_file", async () => {
    const { root, registry } = await tempRegistry();
    roots.push(root);
    const capability = resolveTrustedExecutionCapability({
      userMessage: "Creează un index.html simplu. Scrie efectiv fișierele în workspace.",
    });
    expect(capability.effective).toBe("SCAFFOLD");
    expect(allowsDiskWrites(capability.effective)).toBe(true);
    expect(shouldGrantChatWriteTurn(capability)).toBe(true);
    expect(applyTrustedWriteGate(registry, "stream-scaffold", capability)).toBe("granted");

    const result = await registry.execute(WRITE_ARGS, { turnId: "stream-scaffold" });
    expect(result.ok).toBe(true);
    expect(await fs.readFile(path.join(root, "src", "pwn.ts"), "utf8")).toContain("pwn = 1");
  });

  it("PROPOSE_EDIT never writes disk before Accept", async () => {
    const { root, registry } = await tempRegistry();
    roots.push(root);
    const capability = resolveTrustedExecutionCapability({
      userMessage: "Creează un index.html simplu",
    });
    expect(capability.effective).toBe("PROPOSE_EDIT");
    expect(allowsDiskWrites(capability.effective)).toBe(false);
    expect(shouldGrantChatWriteTurn(capability)).toBe(false);
    expect(shouldAllowChatApplyAccept(capability)).toBe(true);
    expect(applyTrustedWriteGate(registry, "stream-propose", capability)).toBe("blocked");

    const result = await registry.execute(WRITE_ARGS, { turnId: "stream-propose" });
    expect(result.ok).toBe(false);
    await expect(fs.stat(path.join(root, "src", "pwn.ts"))).rejects.toThrow();
  });

  it("renderer READ_ONLY on a main-approved apply remains READ_ONLY", () => {
    const capability = resolveTrustedExecutionCapability({
      userMessage: "Aplică schimbarea",
      rendererRequestedMode: "READ_ONLY",
    });
    expect(capability.mainResolved).toBe("APPLY_EDIT");
    expect(capability.effective).toBe("READ_ONLY");
    expect(shouldGrantChatWriteTurn(capability)).toBe(false);
    expect(shouldAllowChatApplyAccept(capability)).toBe(false);
    expect(stricterExecutionMode("APPLY_EDIT", "READ_ONLY")).toBe("READ_ONLY");
  });

  it("mismatched turn id is denied even after a grant", async () => {
    const { root, registry } = await tempRegistry();
    roots.push(root);
    const capability = resolveTrustedExecutionCapability({
      userMessage: "Aplică schimbarea",
    });
    expect(applyTrustedWriteGate(registry, "stream-apply", capability)).toBe("granted");

    const mismatch = await registry.execute(WRITE_ARGS, { turnId: "other-stream" });
    expect(mismatch.ok).toBe(false);
    expect(mismatch.error).toMatch(/turn id mismatch/i);
    await expect(fs.stat(path.join(root, "src", "pwn.ts"))).rejects.toThrow();

    const allowed = await registry.execute(WRITE_ARGS, { turnId: "stream-apply" });
    expect(allowed.ok).toBe(true);
    expect(await fs.readFile(path.join(root, "src", "pwn.ts"), "utf8")).toContain("pwn = 1");
  });

  it("normal Code/Agentic apply and repair still grant matching turns", async () => {
    const applyCap = resolveTrustedExecutionCapability({
      userMessage: "Aplică schimbarea",
      rendererRequestedMode: "APPLY_EDIT",
    });
    expect(applyCap.effective).toBe("APPLY_EDIT");
    expect(shouldGrantChatWriteTurn(applyCap)).toBe(true);

    const repairCap = resolveTrustedExecutionCapability({
      userMessage: buildAgenticRepairMessage({ wave: 0 }),
      rendererRequestedMode: "READ_ONLY",
    });
    expect(resolveExecutionMode(buildAgenticRepairMessage({ wave: 0 }))).toBe("AGENTIC_REPAIR");
    expect(repairCap.mainResolved).toBe("AGENTIC_REPAIR");
    expect(repairCap.effective).toBe("READ_ONLY");
    expect(shouldGrantChatWriteTurn(repairCap)).toBe(false);

    const repairGranted = resolveTrustedExecutionCapability({
      userMessage: buildAgenticRepairMessage({ wave: 0 }),
    });
    expect(shouldGrantChatWriteTurn(repairGranted)).toBe(true);
    expect(allowsProposedOrWritePipeline(repairGranted.effective)).toBe(true);
  });

  it("ignores unknown renderer mode names and allowWrites-style flags", () => {
    const capability = resolveTrustedExecutionCapability({
      userMessage: "explică index.html",
      rendererRequestedMode: "allowWrites",
    });
    expect(capability.rendererRequested).toBeUndefined();
    expect(capability.effective).toBe("READ_ONLY");
    expect(shouldGrantChatWriteTurn(capability)).toBe(false);
  });
});
