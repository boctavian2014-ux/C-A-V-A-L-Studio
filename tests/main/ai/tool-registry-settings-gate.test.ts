import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { updateAiSettingsSync } from "../../../src/main/ai/ai-settings";
import { executeAiTool } from "../../../src/main/ai/ai-tools-executor";

describe("7e.3 tool settings gate", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects disabled tools with an explicit error", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-7e3-tool-gate-"));
    roots.push(root);
    updateAiSettingsSync(root, {
      toolsEnabled: {
        get_problems: false,
        git_status: true,
        run_task: true,
        open_preview: true,
      },
    });

    const result = await executeAiTool(
      { id: "t1", name: "get_problems", args: {} },
      root,
      {
        getProblems: vi.fn(() => []),
      }
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/disabled in settings/i);
  });

  it("allows enabled tools", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-7e3-tool-ok-"));
    roots.push(root);
    updateAiSettingsSync(root, {
      toolsEnabled: {
        get_problems: true,
        git_status: true,
        run_task: true,
        open_preview: true,
      },
    });

    const result = await executeAiTool(
      { id: "t2", name: "get_problems", args: {} },
      root,
      {
        getProblems: vi.fn(() => [
          {
            id: "p1",
            file: "a.ts",
            message: "x",
            severity: "error" as const,
            source: "typescript" as const,
            line: 1,
            column: 1,
          },
        ]),
      }
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain("a.ts");
  });
});
