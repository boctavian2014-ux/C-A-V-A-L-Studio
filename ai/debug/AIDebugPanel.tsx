import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { eventBus } from "../../components/ui/logicflow/EventBus";
import { useLogicFlowStore } from "../../components/ui/logicflow/LogicFlowStore";
import type { PipelineEvent } from "../../components/ui/logicflow/types";
import { debugPanelApi } from "./debug-panel-api";

export const AIDebugPanel = () => {
  const events = useLogicFlowStore((state) => state.events);
  const setPipelineStep = useLogicFlowStore((state) => state.setPipelineStep);
  const [selected, setSelected] = useState<PipelineEvent | null>(null);
  const [explain, setExplain] = useState<{ explanation: string; suggestions: string[] } | null>(null);

  useEffect(() => {
    const unsub = eventBus.on(async (event) => {
      if (event.type === "error.occurred") {
        setPipelineStep(event.nodeId ?? "debug", "e3");
        setSelected(event);
        const ex = await debugPanelApi.explainError(event);
        setExplain(ex);
      }
    });
    return () => unsub();
  }, [setPipelineStep]);

  const replayTool = async (toolEvent: PipelineEvent) => {
    if (toolEvent.type !== "tool.call") return;
    const replayId = `replay-${Date.now()}`;
    eventBus.emit({
      type: "tool.call",
      id: replayId,
      tool: toolEvent.tool,
      input: toolEvent.input,
      timestamp: Date.now(),
      meta: { replayOf: toolEvent.id }
    });
    const result = await debugPanelApi.replayTool(toolEvent, replayId);
    eventBus.emit({
      type: "tool.result",
      id: replayId,
      success: result.ok,
      output: result.ok ? result.output : { message: result.error ?? "Replay cancelled or failed" },
      timestamp: Date.now(),
      meta: { replayOf: toolEvent.id }
    });
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-[var(--pt-text-primary)]">AI Debug Timeline</h3>
        <div className="text-sm text-[var(--pt-text-secondary)]">{events.length} events</div>
      </header>

      <div className="flex gap-4 flex-1 min-h-0">
        <div className="w-1/2 overflow-auto border-r border-[var(--pt-border)] pr-3">
          {events.length === 0 && (
            <p className="text-sm text-[var(--pt-text-secondary)]">No pipeline events yet. Run Composer or Demo Pipeline.</p>
          )}
          {events.slice().reverse().map((event, index) => (
            <div
              key={`${event.type}-${event.timestamp}-${index}`}
              className="mb-3 p-2 rounded-md bg-[var(--pt-surface-3)] border border-[var(--pt-border)] cursor-pointer hover:border-[var(--pt-cyan)]"
              onClick={() => setSelected(event)}
            >
              <div className="flex justify-between items-center">
                <div className="text-sm font-medium text-[var(--pt-cyan)]">{event.type}</div>
                <div className="text-xs text-[var(--pt-text-secondary)]">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </div>
              </div>
              <pre className="text-xs text-[var(--pt-text-secondary)] mt-2 overflow-auto max-h-24">
                {JSON.stringify("meta" in event ? event.meta ?? event : event, null, 2)}
              </pre>

              <div className="mt-2 flex gap-2 flex-wrap">
                {event.type === "tool.call" && (
                  <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); void replayTool(event); }}>
                    Replay Tool
                  </Button>
                )}
                {event.type === "error.occurred" && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const fix = await debugPanelApi.suggestFix(event);
                      setExplain({ explanation: fix.explanation, suggestions: fix.commands });
                      setSelected(event);
                    }}
                  >
                    Suggest Fix
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="w-1/2 overflow-auto pl-3">
          {selected ? (
            <div>
              <h4 className="text-sm font-semibold text-[var(--pt-cyan)]">Selected Event</h4>
              <pre className="text-sm text-[var(--pt-text-secondary)] mt-2 overflow-auto max-h-48">
                {JSON.stringify(selected, null, 2)}
              </pre>

              {explain && (
                <div className="mt-4">
                  <h5 className="text-sm font-semibold text-[var(--pt-text-primary)]">AI Explanation</h5>
                  <p className="text-sm text-[var(--pt-text-secondary)] mt-2">{explain.explanation}</p>

                  <h6 className="text-sm font-semibold mt-3 text-[var(--pt-text-primary)]">Suggestions</h6>
                  <ul className="list-disc ml-5 mt-2 text-[var(--pt-text-secondary)] text-sm">
                    {explain.suggestions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>

                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void debugPanelApi.applyFixAndRerun(selected, explain.suggestions)}
                    >
                      Apply Fix and Rerun
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setExplain(null); }}>
                      Close
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-[var(--pt-text-secondary)] text-sm">
              Select an event to inspect details and AI suggestions.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
