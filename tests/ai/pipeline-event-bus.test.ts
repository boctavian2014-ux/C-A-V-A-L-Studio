import { describe, expect, it } from "vitest";
import { pipelineEventBus } from "../../ai/pipeline/pipeline-event-bus";

describe("pipelineEventBus", () => {
  it("notifies subscribers and supports unsubscribe", () => {
    const events: string[] = [];
    const unsubscribe = pipelineEventBus.on((event) => {
      events.push(event.type);
    });
    pipelineEventBus.emit({ type: "pipeline.start", timestamp: Date.now() });
    expect(events).toEqual(["pipeline.start"]);
    unsubscribe();
    pipelineEventBus.emit({ type: "pipeline.end", timestamp: Date.now() });
    expect(events).toEqual(["pipeline.start"]);
  });
});
