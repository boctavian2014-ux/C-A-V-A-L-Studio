import { describe, expect, it } from "vitest";

import { ParallelScheduler } from "../../ai/context/parallel/parallel-scheduler";
import type { ParallelTaskInput } from "../../ai/context/parallel/parallel-types";

function sampleTask(overrides: Partial<ParallelTaskInput> = {}): ParallelTaskInput {
  return {
    taskId: "task-1",
    type: "file",
    priority: "MEDIUM",
    workspaceRoot: "/tmp/workspace",
    relativePath: "src/app.ts",
    content: "export const app = 1;",
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("ParallelScheduler bundle guard", () => {
  it("starts zero workers when bundle path is null", () => {
    const scheduler = new ParallelScheduler(4, null);
    expect(scheduler.stats().workers).toBe(0);
  });

  it("schedule resolves without throwing when no workers are available", async () => {
    const scheduler = new ParallelScheduler(4, null);
    const result = await scheduler.schedule(sampleTask());
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/bundle unavailable/i);
  });

  it("dispose clears queue state after inline scheduling", async () => {
    const scheduler = new ParallelScheduler(2, null);
    await scheduler.schedule(sampleTask({ taskId: "a" }));
    await scheduler.dispose();
    expect(scheduler.stats().workers).toBe(0);
    expect(scheduler.stats().queued).toBe(0);
  });
});
