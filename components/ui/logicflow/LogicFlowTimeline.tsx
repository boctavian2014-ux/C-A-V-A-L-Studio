import { useLogicFlowStore } from "./LogicFlowStore";

const TIMELINE_STEPS = [
  { id: "suggestions" as const, label: "AI Suggestions" },
  { id: "composer" as const, label: "AI Composer" },
  { id: "review" as const, label: "Code Review" },
  { id: "debug" as const, label: "Debug" }
];

export const LogicFlowTimeline = () => {
  const activeNodeId = useLogicFlowStore((state) => state.activeNodeId);
  const nodes = useLogicFlowStore((state) => state.nodes);

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-6 bg-[var(--pt-surface-3)] px-6 py-3 rounded-lg border border-[var(--pt-border)] shadow-[var(--pt-shadow-cyan)] z-[15]">
      {TIMELINE_STEPS.map((step) => {
        const node = nodes.find((entry) => entry.id === step.id);
        const isActive = activeNodeId === step.id || node?.active;
        const isDone = node?.status === "done";

        return (
          <div
            key={step.id}
            className={
              "flex flex-col items-center transition-all " +
              (isActive ? "text-[var(--pt-cyan)]" : isDone ? "text-[var(--pt-gold)]" : "text-[var(--pt-text-secondary)]")
            }
          >
            <div
              className={
                "w-3 h-3 rounded-full mb-1 transition-all " +
                (isActive ? "bg-[var(--pt-cyan)] pt-glow" : isDone ? "bg-[var(--pt-gold)]" : "bg-[var(--pt-border)]")
              }
            />
            <span className="text-sm whitespace-nowrap">{step.label}</span>
          </div>
        );
      })}
    </div>
  );
};
