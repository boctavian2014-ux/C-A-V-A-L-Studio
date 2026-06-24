import { pipelineEventBus } from "../pipeline/pipeline-event-bus";
import type { Goal, PlanStep } from "./types";
import { stepTypeToNodeId } from "./types";

export class Planner {
  async createPlan(goal: Goal): Promise<PlanStep[]> {
    const plan: PlanStep[] = [];

    pipelineEventBus.emit({
      type: "pipeline.start",
      timestamp: Date.now(),
      meta: { goal, source: "agent" }
    });

    plan.push({
      id: "s1",
      type: "suggest",
      label: "Analyze repo and propose changes",
      meta: { goal }
    });
    plan.push({
      id: "s2",
      type: "compose",
      label: "Generate patch plan",
      requiresConfirmation: true,
      meta: { goal }
    });
    plan.push({
      id: "s3",
      type: "build",
      label: "Run Expo build",
      meta: { platforms: goal.platforms, version: goal.version }
    });
    plan.push({
      id: "s4",
      type: "test",
      label: "Run automated tests"
    });
    plan.push({
      id: "s5",
      type: "review",
      label: "Auto code review & lint",
      requiresConfirmation: true
    });
    plan.push({
      id: "s6",
      type: "publish",
      label: "Upload to stores",
      requiresConfirmation: true,
      meta: { platforms: goal.platforms, version: goal.version }
    });

    pipelineEventBus.emit({
      type: "node.enter",
      nodeId: stepTypeToNodeId("suggest"),
      timestamp: Date.now(),
      meta: { plan, source: "agent-planner" }
    });

    return plan;
  }
}
