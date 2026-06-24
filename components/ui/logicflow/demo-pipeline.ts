import { eventBus } from "./EventBus";

const toolRunner = {
  async runExpoBuild(platform: "android" | "ios" | "ota") {
    await new Promise((resolve) => setTimeout(resolve, 900));
    if (Math.random() < 0.25) {
      return { ok: false as const, error: "Simulated build failure: missing keystore" };
    }
    return { ok: true as const, url: "https://expo.dev/build/123", platform };
  }
};

export interface DemoPipelineRequest {
  platform: "android" | "ios" | "ota";
}

export async function runDemoPipeline(request: DemoPipelineRequest) {
  eventBus.emit({ type: "pipeline.start", timestamp: Date.now(), meta: { request, demo: true } });

  eventBus.emit({ type: "node.enter", nodeId: "suggestions", timestamp: Date.now(), meta: { stage: "analyze" } });
  await new Promise((resolve) => setTimeout(resolve, 400));
  eventBus.emit({ type: "edge.activate", edgeId: "e1", timestamp: Date.now() });

  eventBus.emit({ type: "node.enter", nodeId: "composer", timestamp: Date.now(), meta: { stage: "plan" } });
  await new Promise((resolve) => setTimeout(resolve, 600));
  eventBus.emit({ type: "edge.activate", edgeId: "e2", timestamp: Date.now() });

  eventBus.emit({ type: "node.enter", nodeId: "review", timestamp: Date.now(), meta: { patches: [{ file: "app.json" }] } });
  await new Promise((resolve) => setTimeout(resolve, 500));
  eventBus.emit({ type: "edge.activate", edgeId: "e3", timestamp: Date.now() });

  eventBus.emit({ type: "node.enter", nodeId: "debug", timestamp: Date.now(), meta: { stage: "build" } });
  const toolId = `tool-${Date.now()}`;
  eventBus.emit({
    type: "tool.call",
    id: toolId,
    tool: "expo.build",
    input: { platform: request.platform },
    timestamp: Date.now()
  });

  const result = await toolRunner.runExpoBuild(request.platform);
  eventBus.emit({ type: "tool.result", id: toolId, success: result.ok, output: result, timestamp: Date.now() });

  if (!result.ok) {
    eventBus.emit({
      type: "error.occurred",
      nodeId: "debug",
      message: result.error ?? "Build failed",
      timestamp: Date.now(),
      meta: { toolId }
    });
  }

  eventBus.emit({ type: "pipeline.finish", timestamp: Date.now(), meta: { success: result.ok, result } });
  return result;
}
