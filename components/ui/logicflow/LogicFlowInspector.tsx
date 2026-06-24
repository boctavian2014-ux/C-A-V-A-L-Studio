import { useEffect, useState } from "react";
import { AIDebugPanel } from "../../../ai/debug/AIDebugPanel";
import { AgentAuditPanel } from "../AgentAuditPanel";
import { AgentGoalPanel } from "../AgentGoalPanel";
import { AgentPlayground } from "../AgentPlayground";
import { SandboxRunnerPanel } from "../SandboxRunnerPanel";
import { Button } from "../Button";
import { SectionTitle } from "../SectionTitle";
import { logicflowApi } from "./logicflow-api";
import { useLogicFlowStore, type InspectorTab } from "./LogicFlowStore";

const NodeInspectorContent = () => {
  const nodes = useLogicFlowStore((state) => state.nodes);
  const selectedNodeId = useLogicFlowStore((state) => state.selectedNodeId);
  const explanation = useLogicFlowStore((state) => state.explanation);
  const explaining = useLogicFlowStore((state) => state.explaining);

  const selected = nodes.find((node) => node.id === selectedNodeId) ?? null;

  return (
    <>
      {!selected && (
        <p className="text-sm text-[var(--pt-text-secondary)]">
          Select a pipeline node to see what it does and when it activates.
        </p>
      )}

      {selected && (
        <>
          <SectionTitle>{selected.label}</SectionTitle>
          <p className="text-sm text-[var(--pt-text-secondary)]">{selected.description}</p>
          <div className="text-xs uppercase tracking-wide text-[var(--pt-text-muted)]">Stage: {selected.stage}</div>

          <Button
            variant="secondary"
            size="sm"
            disabled={explaining}
            onClick={() => void logicflowApi.explainNode(selected.id)}
          >
            {explaining ? "Explaining..." : "Explain with AI"}
          </Button>

          <div className="flex-1 overflow-auto rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface-3)] p-3 text-sm text-[var(--pt-text-primary)] whitespace-pre-wrap min-h-[120px]">
            {explaining && !explanation ? "AI Agent is analyzing this node..." : explanation || "No explanation yet."}
          </div>
        </>
      )}
    </>
  );
};

const TAB_LABELS: Record<InspectorTab, string> = {
  inspector: "Inspector",
  debug: "Debug Timeline",
  agent: "Agent",
  sandbox: "Sandbox",
  playground: "Playground",
  audit: "Audit"
};

export const LogicFlowInspector = () => {
  const inspectorTab = useLogicFlowStore((state) => state.inspectorTab);
  const setInspectorTab = useLogicFlowStore((state) => state.setInspectorTab);
  const [tab, setTab] = useState<InspectorTab>(inspectorTab);

  useEffect(() => {
    setTab(inspectorTab);
  }, [inspectorTab]);

  const selectTab = (next: InspectorTab): void => {
    setTab(next);
    setInspectorTab(next);
  };

  return (
    <div className="logicflow-inspector p-4 h-full flex flex-col gap-3 min-h-0">
      <header>
        <strong className="text-[var(--pt-text-primary)]">Pipeline Inspector</strong>
        <span className="block text-xs text-[var(--pt-text-secondary)] mt-1">Node details, agent goals, and debug timeline</span>
      </header>

      <div className="flex gap-2 border-b border-[var(--pt-border)] pb-2 flex-wrap">
        {(Object.keys(TAB_LABELS) as InspectorTab[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`text-sm pb-1 ${tab === key ? "text-[var(--pt-cyan)] border-b-2 border-[var(--pt-cyan)]" : "text-[var(--pt-text-secondary)]"}`}
            onClick={() => selectTab(key)}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {tab === "inspector" && <NodeInspectorContent />}
        {tab === "debug" && <AIDebugPanel />}
        {tab === "agent" && <AgentGoalPanel />}
        {tab === "sandbox" && <SandboxRunnerPanel />}
        {tab === "playground" && <AgentPlayground />}
        {tab === "audit" && <AgentAuditPanel />}
      </div>
    </div>
  );
};
