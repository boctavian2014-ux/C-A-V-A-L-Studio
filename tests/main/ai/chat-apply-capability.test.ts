import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createIpcHarness } from "../ipc-harness";
import {
  registerTrustedChatTurn,
  resetTrustedChatTurnsForTests,
} from "../../../src/main/ai/trusted-chat-turn";
import {
  resetProposedWritesForTests,
  stageProposedWrites,
} from "../../../src/main/ai/proposed-writes-buffer";

const harness = createIpcHarness();

vi.mock("electron", () => ({
  ipcMain: harness.ipcMain,
}));

vi.mock("../../../src/main/ipc-trust", () => ({
  assertTrustedSender: vi.fn(),
}));

vi.mock("../../../src/main/ai/written-files-persistence", () => ({
  persistAcceptedWrittenFiles: vi.fn(),
}));

describe("chat-apply trusted turn gate", () => {
  let root = "";

  beforeEach(async () => {
    harness.reset();
    resetTrustedChatTurnsForTests();
    resetProposedWritesForTests();
    root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-apply-cap-"));
    const { registerChatApplyHandlers } = await import("../../../src/main/ai/chat-apply-handlers.js");
    registerChatApplyHandlers(() => root);
  });

  afterEach(() => {
    resetTrustedChatTurnsForTests();
    resetProposedWritesForTests();
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = "";
  });

  const write = {
    path: "hello.ts",
    content: "export const hello = 1;\n",
    isNew: true,
  };

  it("denies Accept when the renderer spoofs APPLY_EDIT without a trusted turn", async () => {
    const result = await harness.invoke<{ ok: boolean; error?: string; applied: string[] }>(
      "caval:chat-apply-accept",
      { streamId: "missing", writes: [write] }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/untrusted turn/i);
    expect(fs.existsSync(path.join(root, "hello.ts"))).toBe(false);
  });

  it("denies Accept for an explain turn even with client writes", async () => {
    registerTrustedChatTurn({
      senderId: harness.sender.id,
      streamId: "explain-1",
      mainResolved: "READ_ONLY",
      effective: "READ_ONLY",
    });
    const result = await harness.invoke<{ ok: boolean; error?: string }>("caval:chat-apply-accept", {
      streamId: "explain-1",
      writes: [write],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/untrusted turn/i);
    expect(fs.existsSync(path.join(root, "hello.ts"))).toBe(false);
  });

  it("denies Accept when the turn id does not match the trusted turn", async () => {
    registerTrustedChatTurn({
      senderId: harness.sender.id,
      streamId: "apply-1",
      mainResolved: "APPLY_EDIT",
      effective: "APPLY_EDIT",
    });
    stageProposedWrites("apply-1", [write]);
    const result = await harness.invoke<{ ok: boolean; error?: string }>("caval:chat-apply-accept", {
      streamId: "other-turn",
      stageKey: "other-turn",
      writes: [write],
    });
    expect(result.ok).toBe(false);
    expect(fs.existsSync(path.join(root, "hello.ts"))).toBe(false);
  });

  it("keeps READ_ONLY when the renderer asked to reduce a main-approved apply", async () => {
    registerTrustedChatTurn({
      senderId: harness.sender.id,
      streamId: "reduced-1",
      mainResolved: "APPLY_EDIT",
      effective: "READ_ONLY",
    });
    stageProposedWrites("reduced-1", [write]);
    const result = await harness.invoke<{ ok: boolean }>("caval:chat-apply-accept", {
      streamId: "reduced-1",
      stageKey: "reduced-1",
    });
    expect(result.ok).toBe(false);
    expect(fs.existsSync(path.join(root, "hello.ts"))).toBe(false);
  });

  it("applies buffered writes for a matching PROPOSE_EDIT turn", async () => {
    registerTrustedChatTurn({
      senderId: harness.sender.id,
      streamId: "propose-1",
      mainResolved: "PROPOSE_EDIT",
      effective: "PROPOSE_EDIT",
    });
    stageProposedWrites("propose-1", [write]);
    const result = await harness.invoke<{ ok: boolean; applied: string[] }>(
      "caval:chat-apply-accept",
      { streamId: "propose-1", stageKey: "propose-1", writes: [{ ...write, content: "pwn" }] }
    );
    expect(result.ok).toBe(true);
    expect(result.applied).toEqual(["hello.ts"]);
    expect(fs.readFileSync(path.join(root, "hello.ts"), "utf8")).toContain("hello = 1");
  });

  it("applies buffered writes for a matching Code/Agentic APPLY_EDIT turn", async () => {
    registerTrustedChatTurn(
      {
        senderId: harness.sender.id,
        streamId: "code-1",
        mainResolved: "APPLY_EDIT",
        effective: "APPLY_EDIT",
      },
      ["run-code-1"]
    );
    stageProposedWrites("run-code-1", [write]);
    const result = await harness.invoke<{ ok: boolean; applied: string[] }>(
      "caval:chat-apply-accept",
      { streamId: "code-1", stageKey: "run-code-1" }
    );
    expect(result.ok).toBe(true);
    expect(fs.readFileSync(path.join(root, "hello.ts"), "utf8")).toContain("hello = 1");
  });
});
