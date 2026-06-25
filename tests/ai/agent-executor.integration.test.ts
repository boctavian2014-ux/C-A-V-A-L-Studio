import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Executor } from "../../ai/agent/executor";
import type { Goal, PlanStep } from "../../ai/agent/types";
import { pipelineEventBus } from "../../ai/pipeline/pipeline-event-bus";
import type { PipelineEvent } from "../../ai/pipeline/pipeline-event-bus";

describe("AI Agent executor integration", () => {
  let workspaceRoot: string;
  let executor: Executor;
  let events: PipelineEvent[];
  let unsubscribe: () => void;

  const goal: Goal = {
    action: "publish",
    version: "1.2.0",
    platforms: ["android"],
    requireConfirmationFor: ["publish"],
  };

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "caval-agent-"));
    await fs.writeFile(path.join(workspaceRoot, "app.json"), '{"version":"1.0.0"}\n', "utf8");

    executor = new Executor();
    events = [];
    unsubscribe = pipelineEventBus.on((event) => events.push(event));
  });

  afterEach(async () => {
    unsubscribe();
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("dry-run suggest emits tool.call and tool.result with suggestions", async () => {
    const step: PlanStep = { id: "s1", type: "suggest", label: "Analyze release" };

    const result = await executor.executeStep(step, workspaceRoot, {
      confirmed: true,
      dryRun: true,
      goal,
    });

    expect(result.ok).toBe(true);
    expect(result.output).toMatchObject({
      suggestions: expect.arrayContaining([expect.stringMatching(/1\.2\.0/)]),
    });

    const toolCall = events.find((e) => e.type === "tool.call" && e.tool === "agent.suggest");
    const toolResult = events.find((e) => e.type === "tool.result" && e.id === toolCall?.id);
    expect(toolCall).toBeDefined();
    expect(toolResult?.success).toBe(true);
    expect(events.some((e) => e.type === "node.enter")).toBe(true);
  });

  it("dry-run compose returns simulated patch files", async () => {
    const step: PlanStep = { id: "c1", type: "compose", label: "Bump version" };

    const result = await executor.executeStep(step, workspaceRoot, {
      confirmed: true,
      dryRun: true,
      autoApply: false,
      goal,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { patchFiles?: { path: string }[]; dryRun?: boolean };
    expect(output.dryRun).toBe(true);
    expect(output.patchFiles?.some((f) => f.path === "app.json")).toBe(true);

    expect(events.some((e) => e.type === "tool.call" && e.tool === "composer")).toBe(true);
  });

  it("publish requires confirmation when policy blocks without confirm flag", async () => {
    const step: PlanStep = {
      id: "p1",
      type: "publish",
      label: "Publish to Play Store",
      meta: { platforms: ["android"] },
    };

    const result = await executor.executeStep(step, workspaceRoot, {
      confirmed: false,
      dryRun: true,
      goal,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("confirmation_required");
    expect(result.detail).toMatchObject({
      policyReason: expect.stringMatching(/publish/i),
    });
  });

  it("abort flag stops subsequent steps", async () => {
    executor.abort();
    const step: PlanStep = { id: "b1", type: "build", label: "Build Android", meta: { platforms: ["android"] } };

    const result = await executor.executeStep(step, workspaceRoot, {
      confirmed: true,
      dryRun: true,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("aborted");
  });

  it("dry-run build skips sandbox and records per-platform tool results", async () => {
    executor.resetAbort();
    const step: PlanStep = {
      id: "b2",
      type: "build",
      label: "Build targets",
      meta: { platforms: ["android", "ios"] },
    };

    const result = await executor.executeStep(step, workspaceRoot, {
      confirmed: true,
      dryRun: true,
      sandbox: true,
    });

    expect(result.ok).toBe(true);
    const buildCalls = events.filter((e) => e.type === "tool.call" && e.tool === "eas.build");
    expect(buildCalls.length).toBe(2);
    expect(buildCalls.every((c) => c.meta?.dryRun === true)).toBe(true);
  });
});
