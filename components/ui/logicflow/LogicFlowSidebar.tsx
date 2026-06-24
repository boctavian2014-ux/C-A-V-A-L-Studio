import { SectionTitle } from "../SectionTitle";
import { logicflowApi } from "./logicflow-api";
import { useLogicFlowStore } from "./LogicFlowStore";

export const LogicFlowSidebar = () => {
  const nodes = useLogicFlowStore((state) => state.nodes);
  const selectedNodeId = useLogicFlowStore((state) => state.selectedNodeId);
  const activeNodeId = useLogicFlowStore((state) => state.activeNodeId);
  const selectNode = useLogicFlowStore((state) => state.selectNode);

  return (
    <div className="logicflow-sidebar p-3 h-full flex flex-col gap-3">
      <header>
        <strong className="text-[var(--pt-text-primary)]">AI Pipeline</strong>
        <p className="text-[var(--pt-text-secondary)] text-xs mt-1">Composer flow overview</p>
      </header>

      <SectionTitle>Stages</SectionTitle>
      <div className="flex flex-col gap-2">
        {nodes.map((node) => {
          const isSelected = selectedNodeId === node.id;
          const isActive = activeNodeId === node.id;
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => {
                selectNode(node.id);
                void logicflowApi.explainNode(node.id);
              }}
              className={`text-left px-3 py-2 rounded-md border transition-all ${
                isSelected
                  ? "border-[var(--pt-cyan)] bg-[var(--pt-surface-3)]"
                  : "border-[var(--pt-border)] bg-[var(--pt-surface-2)] hover:border-[var(--pt-cyan)]"
              }`}
            >
              <div className="text-sm font-semibold text-[var(--pt-text-primary)]">{node.label}</div>
              <div className="text-xs text-[var(--pt-text-secondary)]">{node.description}</div>
              {isActive && <div className="text-[10px] uppercase mt-1 text-[var(--pt-cyan)]">active</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
};
