import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pipelineEventBus } from "../../ai/pipeline/pipeline-event-bus";
import type { PipelineEvent } from "../../ai/pipeline/pipeline-event-bus";

const PLAN_JSON = JSON.stringify({
  steps: [
    {
      id: "step-1",
      title: "Update app entry",
      rationale: "Integration test plan",
      files: ["app.ts"],
      symbols: [],
      risk: "low",
    },
  ],
  risks: [],
  validation: [],
});

function patchJson(fullContent: string) {
  return JSON.stringify({
    summary: "Update app.ts",
    files: [{ path: "app.ts", patch: "", fullContent, semanticSummary: "bump export" }],
  });
}

const aiMocks = vi.hoisted(() => ({
  complete: vi.fn().mockImplementation(async (req: { capability?: string }) => {
    if (req.capability === "planning") {
      return { content: PLAN_JSON, model: "test", provider: "test", latencyMs: 1 };
    }
    if (req.capability === "patching") {
      return {
        content: patchJson("export const value = 42;\n"),
        model: "test",
        provider: "test",
        latencyMs: 1,
      };
    }
    return {
      content: "Conceptual preview: adjust app.ts export for integration coverage.",
      model: "test",
      provider: "test",
      latencyMs: 1,
    };
  }),
}));

vi.mock("../../ai/ai-client", () => ({
  AIClient: class {
    complete = aiMocks.complete;
  },
}));

describe("Composer pipeline integration", () => {
  let workspaceRoot: string;
  let events: PipelineEvent[];
  let unsubscribe: (() => void) | undefined;

  beforeEach(async () => {
    aiMocks.complete.mockClear();
    aiMocks.complete.mockImplementation(async (req: { capability?: string }) => {
      if (req.capability === "planning") {
        return { content: PLAN_JSON, model: "test", provider: "test", latencyMs: 1 };
      }
      if (req.capability === "patching") {
        return {
          content: patchJson("export const value = 42;\n"),
          model: "test",
          provider: "test",
          latencyMs: 1,
        };
      }
      return {
        content: "Conceptual preview: adjust app.ts export for integration coverage.",
        model: "test",
        provider: "test",
        latencyMs: 1,
      };
    });

    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "caval-composer-"));
    await fs.writeFile(path.join(workspaceRoot, "app.ts"), "export const value = 1;\n", "utf8");

    events = [];
    unsubscribe = pipelineEventBus.on((event) => events.push(event));

    const { suggestionsStore } = await import("../../ai/suggestions/suggestions-store");
    suggestionsStore.clear();
  });

  afterEach(async () => {
    unsubscribe?.();
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("stops at suggestions gate when skipSuggestions is false", async () => {
    const { AIComposer } = await import("../../ai/composer/composer");
    const composer = new AIComposer();

    const result = await composer.run({
      objective: "Improve app.ts export",
      workspaceRoot,
      skipSuggestions: false,
    });

    expect(result.phase).toBe("awaiting_suggestions");
    expect(result.suggestions?.request).toBe("Improve app.ts export");
    expect(events.some((e) => e.type === "pipeline.start")).toBe(true);
    expect(events.some((e) => e.type === "node.enter" && e.nodeId === "suggestions")).toBe(true);
  });

  it("runs plan → patch → dry apply when suggestions and review are skipped", async () => {
    const { AIComposer } = await import("../../ai/composer/composer");
    const composer = new AIComposer();

    const result = await composer.run({
      objective: "Set app.ts value to 42",
      workspaceRoot,
      skipSuggestions: true,
      skipReview: true,
      dryRun: true,
      runBuild: false,
      runTests: false,
    });

    expect(result.ok).toBe(true);
    expect(result.phase).toBe("completed");
    expect(result.patchSet.files.some((f) => f.path === "app.ts")).toBe(true);
    expect(events.some((e) => e.type === "node.enter" && e.nodeId === "composer")).toBe(true);
    expect(events.some((e) => e.type === "pipeline.finish")).toBe(true);

    const onDisk = await fs.readFile(path.join(workspaceRoot, "app.ts"), "utf8");
    expect(onDisk).toBe("export const value = 1;\n");
  });

  it("returns failed when patch set is empty after generation", async () => {
    aiMocks.complete.mockImplementation(async (req: { capability?: string }) => {
      if (req.capability === "patching") {
        return {
          content: JSON.stringify({ summary: "empty", files: [] }),
          model: "test",
          provider: "test",
          latencyMs: 1,
        };
      }
      return { content: PLAN_JSON, model: "test", provider: "test", latencyMs: 1 };
    });

    const { AIComposer } = await import("../../ai/composer/composer");
    const composer = new AIComposer();

    const result = await composer.run({
      objective: "Broken patch path",
      workspaceRoot,
      skipSuggestions: true,
      skipReview: true,
      dryRun: true,
      runBuild: false,
      runTests: false,
    });

    expect(result.phase).toBe("failed");
    expect(result.diagnostics.some((d) => d.source === "patch-validator")).toBe(true);
    expect(events.some((e) => e.type === "error.occurred")).toBe(true);
  });

  describe("full suggestions → approve → compose flow", () => {
    const objective = "Set app.ts value to 42";

    it("completes compose after approveSuggestions and proceedAfterSuggestions", async () => {
      const { AIComposer } = await import("../../ai/composer/composer");
      const { suggestionsStore } = await import("../../ai/suggestions/suggestions-store");
      const composer = new AIComposer();

      const capabilities: string[] = [];
      aiMocks.complete.mockImplementation(async (req: { capability?: string }) => {
        capabilities.push(req.capability ?? "unknown");
        if (req.capability === "planning") {
          return { content: PLAN_JSON, model: "test", provider: "test", latencyMs: 1 };
        }
        if (req.capability === "patching") {
          return {
            content: patchJson("export const value = 42;\n"),
            model: "test",
            provider: "test",
            latencyMs: 1,
          };
        }
        return {
          content: "Preview: update the export in app.ts.",
          model: "test",
          provider: "test",
          latencyMs: 1,
        };
      });

      const gate = await composer.run({
        objective,
        workspaceRoot,
        skipSuggestions: false,
      });

      expect(gate.phase).toBe("awaiting_suggestions");
      expect(gate.suggestions?.status).toBe("pending");
      const sessionId = gate.suggestions!.id;
      const alternativeId = gate.suggestions!.alternatives.find((a) => a.recommended)?.id ?? "alt-optimized";

      const approved = await composer.approveSuggestions(sessionId, alternativeId);
      expect(approved?.status).toBe("approved");
      expect(approved?.selectedAlternativeId).toBe(alternativeId);
      expect(suggestionsStore.current?.status).toBe("approved");

      const composeRequest = {
        objective,
        workspaceRoot,
        skipReview: true,
        dryRun: true,
        runBuild: false,
        runTests: false,
      };

      const result = await composer.proceedAfterSuggestions(sessionId, composeRequest, alternativeId);

      expect(result.ok).toBe(true);
      expect(result.phase).toBe("completed");
      expect(result.patchSet.files.some((f) => f.path === "app.ts")).toBe(true);
      expect(suggestionsStore.current?.selectedAlternativeId).toBe(alternativeId);
      expect(["approved", "proceeded"]).toContain(suggestionsStore.current?.status);

      expect(capabilities).toContain("reasoning");
      expect(capabilities).toContain("planning");
      expect(capabilities).toContain("patching");

      const suggestionNodes = events.filter((e) => e.type === "node.enter" && e.nodeId === "suggestions");
      const composerNodes = events.filter((e) => e.type === "node.enter" && e.nodeId === "composer");
      expect(suggestionNodes.length).toBeGreaterThan(0);
      expect(composerNodes.length).toBeGreaterThan(0);
      expect(events.some((e) => e.type === "pipeline.finish")).toBe(true);

      const onDisk = await fs.readFile(path.join(workspaceRoot, "app.ts"), "utf8");
      expect(onDisk).toBe("export const value = 1;\n");
    });

    it("completes compose when approved session is passed on a second run", async () => {
      const { AIComposer } = await import("../../ai/composer/composer");
      const { suggestionsApi } = await import("../../ai/suggestions/suggestions-api");
      const composer = new AIComposer();

      const gate = await composer.run({
        objective,
        workspaceRoot,
        skipSuggestions: false,
      });
      const sessionId = gate.suggestions!.id;
      const alternativeId = "alt-minimal";

      await suggestionsApi.approve({ sessionId, alternativeId });
      await suggestionsApi.proceedToComposer(sessionId);

      const result = await composer.run({
        objective,
        workspaceRoot,
        skipSuggestions: false,
        suggestionSessionId: sessionId,
        approvedAlternativeId: alternativeId,
        skipReview: true,
        dryRun: true,
        runBuild: false,
        runTests: false,
      });

      expect(result.phase).toBe("completed");
      expect(result.plan.steps.length).toBeGreaterThan(0);
      expect(result.suggestions).toBeUndefined();
    });

    it("stays at suggestions gate when session is still pending", async () => {
      const { AIComposer } = await import("../../ai/composer/composer");
      const composer = new AIComposer();

      const first = await composer.run({
        objective,
        workspaceRoot,
        skipSuggestions: false,
      });
      const firstSessionId = first.suggestions!.id;

      const second = await composer.run({
        objective,
        workspaceRoot,
        skipSuggestions: false,
      });

      expect(second.phase).toBe("awaiting_suggestions");
      expect(second.suggestions?.status).toBe("pending");
      expect(second.suggestions?.id).not.toBe(firstSessionId);
    });
  });
});
