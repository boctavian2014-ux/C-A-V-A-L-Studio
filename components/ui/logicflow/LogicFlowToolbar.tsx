import { Button } from "../Button";
import { useLogicFlowStore } from "./LogicFlowStore";
import { runDemoPipeline } from "./demo-pipeline";
import { logicflowApi } from "./logicflow-api";
import { replayEvents } from "./replay";

export const LogicFlowToolbar = () => {
  const resetView = useLogicFlowStore((state) => state.resetView);
  const centerView = useLogicFlowStore((state) => state.centerView);
  const selectedNodeId = useLogicFlowStore((state) => state.selectedNodeId);
  const explaining = useLogicFlowStore((state) => state.explaining);
  const liveFlowEnabled = useLogicFlowStore((state) => state.liveFlowEnabled);
  const setLiveFlow = useLogicFlowStore((state) => state.setLiveFlow);
  const setInspectorTab = useLogicFlowStore((state) => state.setInspectorTab);
  const events = useLogicFlowStore((state) => state.events);
  const replaySpeed = useLogicFlowStore((state) => state.replaySpeed);
  const setReplaySpeed = useLogicFlowStore((state) => state.setReplaySpeed);
  const replaying = useLogicFlowStore((state) => state.replaying);
  const setReplaying = useLogicFlowStore((state) => state.setReplaying);
  const clearEvents = useLogicFlowStore((state) => state.clearEvents);

  const runReplay = async () => {
    if (events.length === 0 || replaying) return;
    setReplaying(true);
    try {
      await replayEvents(events, replaySpeed);
    } finally {
      setReplaying(false);
    }
  };

  const runDemo = async () => {
    await runDemoPipeline({ platform: "android" });
  };

  return (
    <div className="absolute top-4 left-4 flex flex-wrap gap-2 bg-[var(--pt-surface-3)] border border-[var(--pt-border)] px-3 py-2 rounded-lg shadow-[var(--pt-shadow-cyan)] z-20 max-w-[90%]">
      <Button
        variant={liveFlowEnabled ? "primary" : "secondary"}
        size="sm"
        onClick={() => setLiveFlow(!liveFlowEnabled)}
      >
        {liveFlowEnabled ? "Live AI Flow: ON" : "Live AI Flow: OFF"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => void runDemo()}>
        Demo Pipeline
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setInspectorTab("playground")}
      >
        Agent Playground
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setInspectorTab("agent")}
      >
        Run Agent Goal
      </Button>
      <Button variant="ghost" size="sm" onClick={resetView}>
        Reset
      </Button>
      <Button variant="ghost" size="sm" onClick={centerView}>
        Center
      </Button>
      <Button variant="ghost" size="sm" disabled={events.length === 0 || replaying} onClick={() => void runReplay()}>
        {replaying ? "Replaying..." : "Replay"}
      </Button>
      <Button variant="ghost" size="sm" disabled={events.length === 0} onClick={clearEvents}>
        Clear
      </Button>
      <select
        className="bg-[var(--pt-surface-2)] border border-[var(--pt-border)] rounded px-2 py-1 text-xs text-[var(--pt-text-primary)]"
        value={replaySpeed}
        onChange={(e) => setReplaySpeed(Number(e.target.value))}
        aria-label="Replay speed"
      >
        <option value={0.5}>0.5x</option>
        <option value={1}>1x</option>
        <option value={2}>2x</option>
      </select>
      <Button
        variant="ghost"
        size="sm"
        disabled={!selectedNodeId || explaining}
        onClick={() => {
          if (selectedNodeId) void logicflowApi.explainNode(selectedNodeId);
        }}
      >
        {explaining ? "Explaining..." : "AI Explain"}
      </Button>
    </div>
  );
};
