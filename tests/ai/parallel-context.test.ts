import { describe, expect, it } from "vitest";

import { createTasksForFile, splitLargeContent } from "../../ai/context/parallel/parallel-batching";
import {
  compareTasks,
  priorityForFile,
  priorityScore,
  taskScore,
} from "../../ai/context/parallel/parallel-priority";
import type { ParallelTaskInput } from "../../ai/context/parallel/parallel-types";

describe("Parallel batching", () => {
  it("keeps small files in a single batch", () => {
    expect(splitLargeContent("hello world")).toEqual(["hello world"]);
  });

  it("splits very large files into multiple batches", () => {
    const large = "x".repeat(40_000);
    const batches = splitLargeContent(large);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.join("")).toBe(large);
  });

  it("creates file, embedding, symbol, dependency, and semantic tasks", () => {
    const tasks = createTasksForFile({
      workspaceRoot: "C:/proj",
      filePath: "C:/proj/src/app.ts",
      content: "export function app() { return 1; }",
      priority: "HIGH",
      includeEmbeddings: true,
      includeSymbols: true,
      includeDependencies: true,
      includeSemantic: true,
    });
    const types = new Set(tasks.map((t) => t.type));
    expect(types.has("file")).toBe(true);
    expect(types.has("embedding")).toBe(true);
    expect(types.has("symbols")).toBe(true);
    expect(types.has("dependencies")).toBe(true);
    expect(types.has("semantic")).toBe(true);
  });
});

describe("Parallel priority", () => {
  it("scores HIGH above LOW", () => {
    expect(priorityScore("HIGH")).toBeGreaterThan(priorityScore("LOW"));
  });

  it("prioritizes active file as HIGH", () => {
    expect(priorityForFile("/src/app.ts", "/src/app.ts")).toBe("HIGH");
    expect(priorityForFile("/src/readme.md")).toBe("LOW");
  });

  it("orders tasks by dynamic score", () => {
    const high: ParallelTaskInput = {
      taskId: "a",
      type: "file",
      priority: "HIGH",
      workspaceRoot: "/p",
      createdAt: Date.now(),
    };
    const low: ParallelTaskInput = {
      taskId: "b",
      type: "semantic",
      priority: "LOW",
      workspaceRoot: "/p",
      createdAt: Date.now(),
    };
    expect(compareTasks(high, low)).toBeLessThan(0);
    expect(taskScore(high)).toBeGreaterThan(taskScore(low));
  });
});
