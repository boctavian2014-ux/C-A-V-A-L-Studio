import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PlanValidator } from "../../ai/composer/plan/plan-validator";
import type { ComposerContext, ComposerPlan } from "../../ai/composer/types";

describe("PlanValidator", () => {
  let tempDir = "";

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("errors when plan has no steps", async () => {
    const diagnostics = await new PlanValidator().validate(
      { id: "p1", objective: "test", steps: [], estimatedFiles: 0, estimatedLines: { min: 0, max: 0 } },
      baseContext("/tmp")
    );
    expect(diagnostics.some((d) => d.message.includes("no steps"))).toBe(true);
  });

  it("warns when referenced files are missing", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "caval-plan-"));
    const plan: ComposerPlan = {
      id: "p2",
      objective: "refactor",
      estimatedFiles: 1,
      estimatedLines: { min: 1, max: 10 },
      steps: [{
        id: "s1",
        title: "Update module",
        rationale: "fix bug",
        files: ["missing.ts"],
        symbols: [],
        risk: "low"
      }]
    };
    const diagnostics = await new PlanValidator().validate(plan, baseContext(tempDir));
    expect(diagnostics.some((d) => d.message.includes("does not exist"))).toBe(true);
  });
});

const baseContext = (workspaceRoot: string): ComposerContext => ({
  objective: "test",
  workspaceRoot,
  relevantFiles: [],
  symbols: [],
  contextBundle: { query: "", semanticResults: [], dependencyGraph: [], queryEmbedding: [] },
  notes: []
});
