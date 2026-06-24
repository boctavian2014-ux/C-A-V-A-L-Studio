import type { LogicFlowNodeData } from "./types";

export interface LogicFlowNodeProps {
  node: LogicFlowNodeData;
  selected: boolean;
  onSelect: (id: LogicFlowNodeData["id"]) => void;
}

export const LogicFlowNode = ({ node, selected, onSelect }: LogicFlowNodeProps) => {
  const isActive = node.active ?? false;

  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className={
        "absolute px-4 py-3 rounded-lg text-left transition-all " +
        (isActive
          ? "border-[var(--pt-cyan)] bg-[var(--pt-surface-2)] text-[var(--pt-text-primary)] shadow-[var(--pt-shadow-strong)] pt-glow"
          : "border-[var(--pt-border)] bg-[var(--pt-surface-2)] text-[var(--pt-text-primary)] shadow-[var(--pt-shadow-cyan)] hover:shadow-[var(--pt-shadow-strong)]") +
        (selected ? " ring-2 ring-[var(--pt-cyan)]" : "") +
        (node.status === "done" ? " border-[var(--pt-gold)]" : "") +
        (node.status === "failed" ? " border-red-500" : "")
      }
      style={{ left: node.x, top: node.y }}
    >
      <div className="font-semibold text-[var(--pt-cyan)] mb-1">{node.label}</div>
      <div className="text-[var(--pt-text-secondary)] text-sm">{node.description}</div>
      {node.status && node.status !== "idle" && (
        <div className="text-xs mt-2 uppercase tracking-wide text-[var(--pt-text-muted)]">{node.status}</div>
      )}
    </button>
  );
};
