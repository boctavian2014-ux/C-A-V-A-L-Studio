import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Problem } from "../../../src/shared/problems-contract";
import { summarizeProblems } from "../../../src/shared/problems-contract";
import {
  ProblemsService,
  parseEslintOutput,
  parseTypeScriptOutput,
  toWorkspaceRelativeFile,
  type ProblemsToolResult,
} from "../../../src/main/problems/problems-service";

function ok(stdout = "", code = 0): ProblemsToolResult {
  return { stdout, stderr: "", code };
}

function sampleTs(file = "src/app.ts"): string {
  return `${file}(12,4): error TS2322: Type 'string' is not assignable to type 'number'.`;
}

function sampleEslintJson(cwd: string): string {
  const filePath = path.join(cwd, "src", "app.ts");
  return JSON.stringify([
    {
      filePath,
      messages: [
        {
          line: 3,
          column: 1,
          endLine: 3,
          endColumn: 8,
          severity: 2,
          message: "'x' is assigned a value but never used.",
          ruleId: "no-unused-vars",
        },
        {
          line: 8,
          column: 2,
          severity: 1,
          message: "Missing return type.",
          ruleId: "@typescript-eslint/explicit-function-return-type",
        },
      ],
    },
  ]);
}

describe("toWorkspaceRelativeFile", () => {
  it("accepts files inside the workspace and rejects traversal", () => {
    const cwd = path.resolve("/repo");
    expect(toWorkspaceRelativeFile(cwd, path.join(cwd, "src", "app.ts"))).toBe("src/app.ts");
    expect(toWorkspaceRelativeFile(cwd, path.join(cwd, "..", "outside.ts"))).toBeNull();
  });
});

describe("parseTypeScriptOutput", () => {
  it("parses tsc --pretty false lines including Windows paths", () => {
    const cwd = path.join(os.tmpdir(), "caval-prob-ts");
    const abs = path.join(cwd, "src", "app.ts");
    const problems = parseTypeScriptOutput(
      `${abs}(12,4): error TS2322: Type 'string' is not assignable to type 'number'.\nFound 1 error.\n`,
      cwd
    );
    expect(problems).toEqual([
      expect.objectContaining({
        file: "src/app.ts",
        line: 12,
        column: 4,
        severity: "error",
        source: "typescript",
        code: "TS2322",
        message: "Type 'string' is not assignable to type 'number'.",
      }),
    ]);
  });
});

describe("parseEslintOutput", () => {
  it("parses ESLint JSON and maps severity 2/1", () => {
    const cwd = path.join(os.tmpdir(), "caval-prob-es");
    const problems = parseEslintOutput(`npm warn ignored\n${sampleEslintJson(cwd)}`, cwd);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatchObject({
      file: "src/app.ts",
      line: 3,
      column: 1,
      severity: "error",
      source: "eslint",
      code: "no-unused-vars",
    });
    expect(problems[1]?.severity).toBe("warning");
  });

  it("returns [] on invalid JSON", () => {
    expect(parseEslintOutput("not json", "/repo")).toEqual([]);
  });
});

describe("summarizeProblems", () => {
  it("counts each severity", () => {
    const problems: Problem[] = [
      { id: "1", file: "a.ts", line: 1, column: 1, severity: "error", source: "typescript", message: "e" },
      { id: "2", file: "a.ts", line: 2, column: 1, severity: "warning", source: "eslint", message: "w" },
      { id: "3", file: "b.ts", line: 1, column: 1, severity: "info", source: "caval", message: "i" },
      { id: "4", file: "b.ts", line: 2, column: 1, severity: "hint", source: "typescript", message: "h" },
    ];
    expect(summarizeProblems(problems)).toEqual({
      total: 4,
      errors: 1,
      warnings: 1,
      infos: 1,
      hints: 1,
    });
  });
});

describe("ProblemsService", () => {
  let cwd: string;

  afterEach(() => {
    if (cwd) fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("collect parses TypeScript and ESLint output and filters getProblems(file)", async () => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "caval-problems-"));
    fs.writeFileSync(path.join(cwd, "tsconfig.json"), "{}");
    fs.writeFileSync(path.join(cwd, "eslint.config.js"), "module.exports = [];\n");

    const runTool = vi.fn(async (kind: "typescript" | "eslint") => {
      if (kind === "typescript") return ok(sampleTs(path.join(cwd, "src", "app.ts")), 1);
      return ok(sampleEslintJson(cwd), 1);
    });

    const service = new ProblemsService({ runTool });
    const problemEvents: Problem[][] = [];
    const summaryEvents: unknown[] = [];
    service.on("problems-changed", (next: Problem[]) => problemEvents.push(next));
    service.on("summary-changed", (next) => summaryEvents.push(next));

    await service.collect(cwd);

    expect(runTool).toHaveBeenCalledWith(
      "typescript",
      ["--noEmit", "--pretty", "false"],
      cwd
    );
    expect(runTool).toHaveBeenCalledWith("eslint", ["--format", "json", "."], cwd);

    const all = service.getProblems();
    expect(all.some((p) => p.source === "typescript" && p.code === "TS2322")).toBe(true);
    expect(all.some((p) => p.source === "eslint" && p.code === "no-unused-vars")).toBe(true);
    expect(service.getProblems("src/app.ts").length).toBe(all.length);
    expect(service.getProblems("missing.ts")).toEqual([]);

    const summary = service.getSummary();
    expect(summary.total).toBe(all.length);
    expect(summary.errors).toBeGreaterThan(0);
    expect(problemEvents.length).toBe(1);
    expect(summaryEvents.length).toBe(1);
  });

  it("skips tools when config files are absent", async () => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "caval-problems-empty-"));
    const runTool = vi.fn(async () => ok());
    const service = new ProblemsService({ runTool });
    await service.collect(cwd);
    expect(runTool).not.toHaveBeenCalled();
    expect(service.getProblems()).toEqual([]);
  });
});
