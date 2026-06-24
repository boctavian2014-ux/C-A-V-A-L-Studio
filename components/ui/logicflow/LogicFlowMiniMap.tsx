import { useLogicFlowStore } from "./LogicFlowStore";

const MINI_WIDTH = 160;
const MINI_HEIGHT = 112;

export const LogicFlowMiniMap = () => {
  const nodes = useLogicFlowStore((state) => state.nodes);
  const activeNodeId = useLogicFlowStore((state) => state.activeNodeId);
  const selectedNodeId = useLogicFlowStore((state) => state.selectedNodeId);

  if (nodes.length === 0) return null;

  const minX = Math.min(...nodes.map((node) => node.x));
  const maxX = Math.max(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxY = Math.max(...nodes.map((node) => node.y));
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);

  const toMini = (x: number, y: number) => ({
    left: ((x - minX) / spanX) * (MINI_WIDTH - 24) + 12,
    top: ((y - minY) / spanY) * (MINI_HEIGHT - 36) + 24
  });

  return (
    <div
      className="absolute bottom-4 right-4 bg-[var(--pt-surface-3)] border border-[var(--pt-border)] rounded-lg opacity-90 z-10"
      style={{ width: MINI_WIDTH, height: MINI_HEIGHT }}
    >
      <div className="text-[var(--pt-text-secondary)] text-xs p-2 border-b border-[var(--pt-border)]">
        Pipeline Overview
      </div>
      <div className="relative" style={{ height: MINI_HEIGHT - 28 }}>
        {nodes.map((node) => {
          const pos = toMini(node.x, node.y);
          const highlighted = node.id === activeNodeId || node.id === selectedNodeId;
          return (
            <span
              key={node.id}
              className={`absolute w-2 h-2 rounded-full ${highlighted ? "bg-[var(--pt-cyan)]" : "bg-[var(--pt-text-muted)]"}`}
              style={{ left: pos.left, top: pos.top }}
              title={node.label}
            />
          );
        })}
      </div>
    </div>
  );
};
