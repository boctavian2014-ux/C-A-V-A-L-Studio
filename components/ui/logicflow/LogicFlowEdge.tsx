import { useLogicFlowStore } from "./LogicFlowStore";
import type { LogicFlowPoint } from "./types";

export interface LogicFlowEdgeProps {
  id: string;
  from: LogicFlowPoint;
  to: LogicFlowPoint;
}

export const LogicFlowEdge = ({ id, from, to }: LogicFlowEdgeProps) => {
  const activeEdgeId = useLogicFlowStore((state) => state.activeEdgeId);
  const isActive = activeEdgeId === id;

  const path = `M ${from.x} ${from.y} C ${from.x + 80} ${from.y}, ${to.x - 80} ${to.y}, ${to.x} ${to.y}`;

  return (
    <path
      id={id}
      d={path}
      stroke="var(--pt-cyan)"
      strokeWidth={isActive ? 3 : 2}
      fill="none"
      className={isActive ? "pt-edge-active" : "opacity-40"}
    />
  );
};
