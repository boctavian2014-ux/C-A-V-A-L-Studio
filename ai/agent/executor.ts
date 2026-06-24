import { pipelineEventBus } from "../pipeline/pipeline-event-bus";
import { toolSandbox } from "../pipeline/tool-sandbox";
import { AIComposer } from "../composer/composer";
import { codeReviewStore } from "../review/code-review-store";
import type { LogicFlowNodeId } from "../../components/ui/logicflow/types";
import { PolicyEngine } from "./policy";
import type { AgentPlatform, AgentStepResult, Goal, PlanStep } from "./types";
import { stepTypeToNodeId } from "./types";

export class Executor {
  private readonly policy = new PolicyEngine();
  private readonly composer = new AIComposer();
  private aborted = false;

  abort(): void {
    this.aborted = true;
  }

  resetAbort(): void {
    this.aborted = false;
  }

  isAborted(): boolean {
    return this.aborted;
  }

  private emitNodeEnter(step: PlanStep, nodeId?: LogicFlowNodeId): void {
    pipelineEventBus.emit({
      type: "node.enter",
      nodeId: nodeId ?? stepTypeToNodeId(step.type),
      timestamp: Date.now(),
      meta: { step, stepId: step.id }
    });
  }

  private emitEdge(step: PlanStep, edgeId: string, meta?: Record<string, unknown>): void {
    pipelineEventBus.emit({
      type: "edge.activate",
      edgeId,
      timestamp: Date.now(),
      meta: { step, stepId: step.id, ...meta }
    });
  }

  private emitError(step: PlanStep, message: string, meta?: Record<string, unknown>): void {
    pipelineEventBus.emit({
      type: "error.occurred",
      nodeId: stepTypeToNodeId(step.type),
      message,
      timestamp: Date.now(),
      meta: { step, stepId: step.id, ...meta }
    });
  }

  async executeStep(
    step: PlanStep,
    workspaceRoot: string,
    options: { confirmed: boolean; autoApply?: boolean; dryRun?: boolean; sandbox?: boolean; goal?: Goal }
  ): Promise<AgentStepResult> {
    if (options.goal) {
      this.policy.setGoalContext(options.goal);
    }
    const dryRun = options.dryRun ?? options.goal?.dryRun ?? false;
    const useSandbox = options.sandbox ?? options.goal?.sandbox ?? true;
    if (this.aborted) {
      return { ok: false, reason: "aborted" };
    }

    this.emitNodeEnter(step);

    const decision = this.policy.evaluateStep(step);
    const needsConfirmation = step.requiresConfirmation || (!decision.allowed && decision.requireHuman);

    if (needsConfirmation && !options.confirmed) {
      return {
        ok: false,
        reason: "confirmation_required",
        detail: { step, policyReason: decision.reason }
      };
    }

    if (this.aborted) {
      return { ok: false, reason: "aborted" };
    }

    try {
      switch (step.type) {
        case "suggest":
          return this.executeSuggest(step, workspaceRoot, dryRun, options.goal);
        case "compose":
          return this.executeCompose(step, workspaceRoot, options.autoApply, dryRun, options.goal);
        case "build":
          return this.executeBuild(step, workspaceRoot, dryRun, useSandbox);
        case "test":
          return this.executeTest(step, workspaceRoot, dryRun, useSandbox);
        case "review":
          return this.executeReview(step, dryRun);
        case "publish":
          return this.executePublish(step, workspaceRoot, dryRun, useSandbox);
        case "manual":
          return options.confirmed ? { ok: true } : { ok: false, reason: "manual_rejected" };
        default:
          return { ok: false, reason: "unknown_step_type" };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitError(step, message);
      return { ok: false, reason: "execution_error", detail: message };
    } finally {
      if (!this.aborted) {
        this.emitEdge(step, `done-${step.id}`);
      }
    }
  }

  private buildObjective(goal?: Goal, fallback = "Agent objective"): string {
    if (!goal) return fallback;
    return `Publish version ${goal.version} to ${goal.platforms.join(", ")}${goal.notes ? `: ${goal.notes}` : ""}`;
  }

  private async executeSuggest(
    step: PlanStep,
    workspaceRoot: string,
    dryRun: boolean,
    goal?: Goal
  ): Promise<AgentStepResult> {
    const toolId = `agent-suggest-${Date.now()}`;
    pipelineEventBus.emit({
      type: "tool.call",
      id: toolId,
      tool: "agent.suggest",
      input: { step },
      timestamp: Date.now(),
      meta: dryRun ? { dryRun: true } : undefined
    });

    if (!dryRun && goal) {
      const result = await this.composer.run({
        objective: this.buildObjective(goal, step.label),
        workspaceRoot,
        skipReview: true,
        runBuild: false,
        runTests: false
      });
      pipelineEventBus.emit({
        type: "tool.result",
        id: toolId,
        success: result.phase !== "failed",
        output: result,
        timestamp: Date.now()
      });
      return { ok: result.phase !== "failed", output: result };
    }

    await new Promise((resolve) => setTimeout(resolve, dryRun ? 50 : 200));
    const output = {
      suggestions: [
        `Bump version to ${goal?.version ?? "next"}`,
        "Review app.json and eas.json before publish"
      ]
    };
    pipelineEventBus.emit({
      type: "tool.result",
      id: toolId,
      success: true,
      output,
      timestamp: Date.now()
    });
    return { ok: true, output };
  }

  private async executeCompose(
    step: PlanStep,
    workspaceRoot: string,
    autoApply?: boolean,
    dryRun?: boolean,
    goal?: Goal
  ): Promise<AgentStepResult> {
    const toolId = `agent-compose-${Date.now()}`;
    pipelineEventBus.emit({
      type: "tool.call",
      id: toolId,
      tool: "composer",
      input: { step, autoApply, dryRun },
      timestamp: Date.now(),
      meta: dryRun ? { dryRun: true } : undefined
    });
    if (!dryRun && workspaceRoot) {
      const result = await this.composer.run({
        objective: this.buildObjective(goal, step.label),
        workspaceRoot,
        skipSuggestions: true,
        skipReview: !(autoApply ?? false),
        runBuild: false,
        runTests: false
      });
      pipelineEventBus.emit({
        type: "tool.result",
        id: toolId,
        success: result.phase !== "failed",
        output: result,
        timestamp: Date.now()
      });
      return { ok: result.phase !== "failed", output: result };
    }

    await new Promise((resolve) => setTimeout(resolve, dryRun ? 50 : 300));
    const version = goal?.version ?? (step.meta?.goal as Goal | undefined)?.version ?? "1.2.0";
    const patchFiles = [
      {
        path: "app.json",
        patch: [
          `--- a/app.json`,
          `+++ b/app.json`,
          `@@ -1,3 +1,3 @@`,
          `-  "version": "1.0.0",`,
          `+  "version": "${version}",`
        ].join("\n")
      }
    ];
    const output = {
      patches: [`app.json: bump version to ${version}`],
      patchFiles,
      autoApply: dryRun ? false : autoApply ?? false,
      dryRun: dryRun ?? false
    };
    pipelineEventBus.emit({
      type: "tool.result",
      id: toolId,
      success: true,
      output,
      timestamp: Date.now()
    });
    return { ok: true, output };
  }

  private async executeBuild(
    step: PlanStep,
    workspaceRoot: string,
    dryRun: boolean,
    useSandbox: boolean
  ): Promise<AgentStepResult> {
    const platforms = (step.meta?.platforms as AgentPlatform[] | undefined) ?? ["android"];

    for (const platform of platforms) {
      if (platform === "ota") {
        continue;
      }

      if (this.aborted) {
        return { ok: false, reason: "aborted" };
      }

      this.emitEdge(step, `build-${platform}`, { platform });
      const toolId = `agent-build-${platform}-${Date.now()}`;

      pipelineEventBus.emit({
        type: "tool.call",
        id: toolId,
        tool: "eas.build",
        input: { platform },
        timestamp: Date.now(),
        meta: { stepId: step.id, dryRun: dryRun || undefined }
      });

      if (dryRun || !useSandbox) {
        const simulated = { ok: true, output: { dryRun: true, platform, message: "Build skipped (dry run)" } };
        pipelineEventBus.emit({
          type: "tool.result",
          id: toolId,
          success: true,
          output: simulated.output,
          timestamp: Date.now(),
          meta: { dryRun: true, platform }
        });
        continue;
      }

      const result = await toolSandbox.run(
        { toolCallId: toolId, tool: "eas.build", input: { platform }, confirm: true },
        workspaceRoot
      );

      if (!result.ok) {
        this.emitError(step, result.error ?? "build failed", { platform });
        return { ok: false, reason: "build_failed", detail: result };
      }
    }

    return { ok: true };
  }

  private async executeTest(
    step: PlanStep,
    workspaceRoot: string,
    dryRun: boolean,
    useSandbox: boolean
  ): Promise<AgentStepResult> {
    const toolId = `agent-test-${Date.now()}`;
    pipelineEventBus.emit({
      type: "tool.call",
      id: toolId,
      tool: "npm.script",
      input: { script: "cicd:test" },
      timestamp: Date.now(),
      meta: dryRun ? { dryRun: true } : undefined
    });

    if (dryRun || !useSandbox) {
      pipelineEventBus.emit({
        type: "tool.result",
        id: toolId,
        success: true,
        output: { dryRun: true, message: "Tests skipped (dry run)" },
        timestamp: Date.now(),
        meta: { dryRun: true }
      });
      return { ok: true, output: { dryRun: true } };
    }

    const result = await toolSandbox.run(
      { toolCallId: toolId, tool: "npm.script", input: { script: "cicd:test" }, confirm: true },
      workspaceRoot
    );

    if (!result.ok) {
      this.emitError(step, result.error ?? "tests failed");
      return { ok: false, reason: "tests_failed", detail: result };
    }

    return { ok: true, output: result.output };
  }

  private async executeReview(step: PlanStep, dryRun: boolean): Promise<AgentStepResult> {
    const toolId = `agent-review-${Date.now()}`;
    pipelineEventBus.emit({
      type: "tool.call",
      id: toolId,
      tool: "agent.review",
      input: { step },
      timestamp: Date.now(),
      meta: dryRun ? { dryRun: true } : undefined
    });

    const session = codeReviewStore.current;
    if (!dryRun && session) {
      const output = { lintOk: true, issues: [] as string[], sessionId: session.id, fileCount: session.files.length };
      pipelineEventBus.emit({
        type: "tool.result",
        id: toolId,
        success: true,
        output,
        timestamp: Date.now()
      });
      return { ok: true, output };
    }

    await new Promise((resolve) => setTimeout(resolve, dryRun ? 50 : 250));
    const output = { lintOk: true, issues: [] as string[] };
    pipelineEventBus.emit({
      type: "tool.result",
      id: toolId,
      success: true,
      output,
      timestamp: Date.now()
    });
    return { ok: true, output };
  }

  private async executePublish(
    step: PlanStep,
    workspaceRoot: string,
    dryRun: boolean,
    useSandbox: boolean
  ): Promise<AgentStepResult> {
    const platforms = (step.meta?.platforms as AgentPlatform[] | undefined) ?? [];

    if (platforms.includes("ota") && !dryRun && useSandbox) {
      const toolId = `agent-publish-ota-${Date.now()}`;
      pipelineEventBus.emit({
        type: "tool.call",
        id: toolId,
        tool: "expo.doctor",
        input: { action: "ota-check" },
        timestamp: Date.now()
      });

      const result = await toolSandbox.run(
        { toolCallId: toolId, tool: "expo.doctor", confirm: true },
        workspaceRoot
      );

      if (!result.ok) {
        this.emitError(step, result.error ?? "OTA publish check failed");
        return { ok: false, reason: "publish_failed", detail: result };
      }
    }

    const toolId = `agent-publish-${Date.now()}`;
    pipelineEventBus.emit({
      type: "tool.call",
      id: toolId,
      tool: "agent.publish",
      input: { step },
      timestamp: Date.now(),
      meta: dryRun ? { dryRun: true } : undefined
    });
    if (dryRun) {
      pipelineEventBus.emit({
        type: "tool.result",
        id: toolId,
        success: true,
        output: { dryRun: true, message: "Publish skipped (dry run)" },
        timestamp: Date.now(),
        meta: { dryRun: true }
      });
      return { ok: true, output: { dryRun: true } };
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    pipelineEventBus.emit({
      type: "tool.result",
      id: toolId,
      success: true,
      output: { message: "Store upload simulated — configure EAS Submit for production." },
      timestamp: Date.now()
    });

    return { ok: true, output: { simulated: true } };
  }
}
