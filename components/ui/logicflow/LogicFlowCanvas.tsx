import { LogicFlowEdge } from "./LogicFlowEdge";
import { LogicFlowMiniMap } from "./LogicFlowMiniMap";
import { LogicFlowNode } from "./LogicFlowNode";
import { LogicFlowTimeline } from "./LogicFlowTimeline";
import { useLogicFlowStore } from "./LogicFlowStore";
import { LogicFlowToolbar } from "./LogicFlowToolbar";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 72;

const nodeAnchor = (x: number, y: number, side: "out" | "in") => ({
  x: side === "out" ? x + NODE_WIDTH : x,
  y: y + NODE_HEIGHT / 2
});

export const LogicFlowCanvas = () => {
  const nodes = useLogicFlowStore((state) => state.nodes);
  const edges = useLogicFlowStore((state) => state.edges);
  const selectedNodeId = useLogicFlowStore((state) => state.selectedNodeId);
  const panX = useLogicFlowStore((state) => state.panX);
  const panY = useLogicFlowStore((state) => state.panY);
  const zoom = useLogicFlowStore((state) => state.zoom);
  const selectNode = useLogicFlowStore((state) => state.selectNode);

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  return (
    <div className="relative w-full h-full bg-[var(--pt-deep-blue)] overflow-hidden">
      <LogicFlowToolbar />
      <LogicFlowMiniMap />
      <LogicFlowTimeline />

      <div
        className="absolute inset-0"
        style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})`, transformOrigin: "0 0" }}
      >
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ minWidth: 1200, minHeight: 400 }}>
          {edges.map((edge) => {
            const fromNode = nodeMap.get(edge.fromId);
            const toNode = nodeMap.get(edge.toId);
            if (!fromNode || !toNode) return null;
            return (
              <LogicFlowEdge
                key={edge.id}
                id={edge.id}
                from={nodeAnchor(fromNode.x, fromNode.y, "out")}
                to={nodeAnchor(toNode.x, toNode.y, "in")}
              />
            );
          })}
        </svg>

        {nodes.map((node) => (
          <LogicFlowNode
            key={node.id}
            node={node}
            selected={selectedNodeId === node.id}
            onSelect={selectNode}
          />
        ))}
      </div>
    </div>
  );
};
