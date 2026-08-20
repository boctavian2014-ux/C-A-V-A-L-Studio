import { describe, expect, it, vi } from "vitest";

import { executeAiTool } from "../../../src/main/ai/ai-tools-executor";
import { AI_TOOL_DEFINITIONS, isAiToolName } from "../../../src/shared/ai-tools-contract";
import { ToolRegistry } from "../../../ai/tools/tool-registry";
import type { PreviewState } from "../../../src/shared/preview-contract";

describe("ai tools contract", () => {
  it("recognizes only the v1 safe tool names", () => {
    expect(isAiToolName("get_problems")).toBe(true);
    expect(isAiToolName("git_status")).toBe(true);
    expect(isAiToolName("run_task")).toBe(true);
    expect(isAiToolName("open_preview")).toBe(true);
    expect(isAiToolName("git_commit")).toBe(false);
    expect(isAiToolName("run_terminal_command")).toBe(false);
  });

  it("exposes definitions for registry listing", () => {
    expect(AI_TOOL_DEFINITIONS.map((d) => d.name)).toEqual([
      "get_problems",
      "git_status",
      "run_task",
      "open_preview",
    ]);
  });
});

describe("executeAiTool", () => {
  const root = "C:/bound/workspace";

  it("rejects empty workspace root", async () => {
    const result = await executeAiTool(
      { id: "1", name: "git_status", args: {} },
      "   ",
      {
        gitStatus: vi.fn(),
      }
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No bound workspace/i);
  });

  it("get_problems returns capped problems", async () => {
    const problems = Array.from({ length: 40 }, (_, i) => ({
      id: `p${i}`,
      file: `src/f${i}.ts`,
      line: i + 1,
      column: 1,
      severity: "error" as const,
      source: "typescript" as const,
      message: `err ${i}`,
    }));
    const result = await executeAiTool(
      { id: "p", name: "get_problems", args: {} },
      root,
      { getProblems: () => problems }
    );
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output) as unknown[];
    expect(parsed).toHaveLength(25);
  });

  it("git_status returns status JSON", async () => {
    const result = await executeAiTool(
      { id: "g", name: "git_status", args: {} },
      root,
      {
        gitStatus: async (cwd) => {
          expect(cwd).toBe(root);
          return { branch: "main", files: [{ path: "a.ts", status: "modified" }], isClean: false };
        },
      }
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain('"branch": "main"');
  });

  it("run_task rejects unknown tasks before execution", async () => {
    const runTask = vi.fn();
    const result = await executeAiTool(
      { id: "t", name: "run_task", args: { taskName: "does-not-exist" } },
      root,
      {
        listTasks: () => [{ name: "test" }, { name: "build" }],
        runTask,
      }
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Task not found/i);
    expect(runTask).not.toHaveBeenCalled();
  });

  it("run_task rejects invalid taskName", async () => {
    const result = await executeAiTool(
      { id: "t", name: "run_task", args: { taskName: "foo;rm -rf" } },
      root,
      { listTasks: () => [{ name: "test" }], runTask: vi.fn() }
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid taskName/i);
  });

  it("run_task runs an allowlisted package.json script", async () => {
    const result = await executeAiTool(
      { id: "t", name: "run_task", args: { taskName: "test" } },
      root,
      {
        listTasks: () => [{ name: "test" }],
        runTask: async (_cwd, name) => {
          expect(name).toBe("test");
          return { status: "success", id: "run-1" };
        },
      }
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain("Task test: success");
  });

  it("open_preview rejects invalid targets", async () => {
    const startPreview = vi.fn();
    const result = await executeAiTool(
      { id: "o", name: "open_preview", args: { target: "desktop" } },
      root,
      { startPreview }
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid target/i);
    expect(startPreview).not.toHaveBeenCalled();
  });

  it("open_preview starts web/mobile", async () => {
    const state: PreviewState = {
      target: "web",
      status: "starting",
      url: "http://127.0.0.1:5173",
      pid: 1,
      startedAt: Date.now(),
      lastError: null,
    };
    const result = await executeAiTool(
      { id: "o", name: "open_preview", args: { target: "web" } },
      root,
      {
        startPreview: async (target, cwd) => {
          expect(target).toBe("web");
          expect(cwd).toBe(root);
          return state;
        },
      }
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain("Preview web");
  });

  it("redacts secrets in tool output", async () => {
    const result = await executeAiTool(
      { id: "g", name: "git_status", args: {} },
      root,
      {
        gitStatus: async () => ({
          branch: "main",
          note: "token sk-or-v1-abcdefghijklmnopqrstuvwxyz012345",
        }),
      }
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain("[REDACTED]");
    expect(result.output).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
  });

  it("rejects invalid args object", async () => {
    const result = await executeAiTool(
      { id: "x", name: "get_problems", args: null as unknown as Record<string, unknown> },
      root,
      { getProblems: () => [] }
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid args/i);
  });
});

describe("ToolRegistry IDE tools", () => {
  it("lists the four safe IDE tools", () => {
    const registry = new ToolRegistry("/ws");
    const names = registry.listTools().map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["get_problems", "git_status", "run_task", "open_preview"]));
    expect(names).not.toContain("git_commit");
  });

  it("routes IDE tools through executeAiTool with the registry workspace", async () => {
    const registry = new ToolRegistry("/bound/ws");
    // Smoke: invalid preview target never leaves the bound root path for spawn.
    const result = await registry.execute({
      name: "open_preview",
      arguments: { target: "evil" },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid target/i);
  });
});
