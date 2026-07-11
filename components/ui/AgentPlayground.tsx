import { useState } from "react";
import { AIDebugPanel } from "../../ai/debug/AIDebugPanel";
import { runGoalWithUI } from "../../ai/agent/ui-orchestrator";
import type { Goal } from "../../ai/agent/types";
import { Button } from "./Button";
import { ConfirmProvider, useConfirm } from "./confirm";
import { SandboxRunnerPanel } from "./SandboxRunnerPanel";

const DEMO_GOAL: Goal = {
  action: "publish",
  version: "1.2.0",
  platforms: ["android", "ios"],
  mode: "human-in-loop",
  sandbox: true,
  dryRun: false,
  requireConfirmationFor: ["publish", "credentials"]
};

const StartButton = () => {
  const requestConfirm = useConfirm();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");

  const start = async (): Promise<void> => {
    if (running) return;
    setRunning(true);
    setStatus("Starting agent run...");

    const res = await runGoalWithUI(DEMO_GOAL, async (step) => requestConfirm(step), {
      onStatus: setStatus,
      replayOnFinish: true
    });

    setStatus(res.ok ? "Agent finished successfully." : `Agent finished: ${res.reason ?? "failed"}`);
    setRunning(false);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button variant="primary" size="sm" disabled={running} onClick={() => void start()}>
        {running ? "Running..." : "Run Agentic Publish"}
      </Button>
      {status && <span className="text-xs text-[var(--pt-cyan)]">{status}</span>}
    </div>
  );
};

export const AgentPlayground = () => (
  <ConfirmProvider>
    <div className="flex flex-col gap-4 h-full min-h-0">
      <header className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold text-[var(--pt-text-primary)]">Agent Playground</h3>
        <p className="text-xs text-[var(--pt-text-secondary)]">
          Demo publish flow with confirmations, debug timeline, and sandbox tools. Canvas stays in the center panel.
        </p>
        <StartButton />
      </header>

      <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-auto">
        <div className="flex-1 min-h-[140px] overflow-auto flex flex-col rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface-3)] p-2">
          <h4 className="text-sm font-semibold text-[var(--pt-cyan)] mb-2">AI Debug Panel</h4>
          <div className="flex-1 min-h-0 overflow-auto">
            <AIDebugPanel />
          </div>
        </div>

        <div className="flex-1 min-h-[140px] overflow-auto flex flex-col rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface-3)] p-2">
          <SandboxRunnerPanel />
        </div>
      </div>
    </div>
  </ConfirmProvider>
);
