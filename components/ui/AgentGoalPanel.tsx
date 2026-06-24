import { useState } from "react";
import { abortAgentRun, runGoalWithUI } from "../../ai/agent/ui-orchestrator";
import type { AgentPlatform, Goal, PlanStep } from "../../ai/agent/types";
import { Button } from "./Button";
import { Input } from "./Input";
import { confirmStore } from "./confirm-store";
import { useLogicFlowStore } from "./logicflow/LogicFlowStore";

const PLATFORM_OPTIONS: AgentPlatform[] = ["android", "ios", "ota"];

export const AgentGoalPanel = () => {
  const [version, setVersion] = useState("1.0.0");
  const [notes, setNotes] = useState("");
  const [platforms, setPlatforms] = useState<AgentPlatform[]>(["android"]);
  const [plan, setPlan] = useState<PlanStep[]>([]);
  const [running, setRunning] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [humanInLoop, setHumanInLoop] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const events = useLogicFlowStore((state) => state.events);

  const togglePlatform = (platform: AgentPlatform): void => {
    setPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  };

  const buildGoal = (): Goal => ({
    action: "publish",
    version: version.trim() || "1.0.0",
    platforms: platforms.length > 0 ? platforms : ["android"],
    notes: notes.trim() || undefined,
    mode: humanInLoop ? "human-in-loop" : "auto",
    sandbox: true,
    dryRun,
    requireConfirmationFor: ["publish", "credentials"]
  });

  const confirmStep = async (step: PlanStep): Promise<{ confirmed: boolean; autoApply?: boolean }> => {
    return confirmStore.request({
      title: `Confirm: ${step.label}`,
      message: "This step requires confirmation before the agent proceeds.",
      step,
      showAutoApply: step.type === "compose"
    });
  };

  const runAgent = async (): Promise<void> => {
    if (running) return;
    setRunning(true);
    setStatus("Creating plan...");
    setPlan([]);
    setCurrentStepId(null);

    const result = await runGoalWithUI(buildGoal(), confirmStep, {
      onPlanCreated: setPlan,
      onStepStart: (step) => setCurrentStepId(step.id),
      onStatus: setStatus,
      replayOnFinish: !dryRun,
      persistAudit: true
    });

    if (!result.ok) {
      setStatus(result.reason === "user_rejected" ? "Cancelled at step" : `Failed: ${result.reason ?? "unknown"}`);
    } else {
      setStatus(
        result.audit
          ? `Completed. Replay token: ${result.audit.replayToken}`
          : "Agent run completed successfully."
      );
    }

    setCurrentStepId(null);
    setRunning(false);
    if (result.plan) {
      setPlan(result.plan);
    }
  };

  const abortAgent = async (): Promise<void> => {
    await abortAgentRun();
    setRunning(false);
    setStatus("Aborted.");
    setCurrentStepId(null);
  };

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <header>
        <h3 className="text-lg font-semibold text-[var(--pt-text-primary)]">Agent Goal</h3>
        <p className="text-xs text-[var(--pt-text-secondary)] mt-1">
          Publish workflow with human checkpoints and sandboxed builds.
        </p>
      </header>

      <div className="grid gap-2">
        <label className="text-xs text-[var(--pt-text-secondary)]">
          Version
          <Input value={version} onChange={(e) => setVersion(e.target.value)} className="mt-1" />
        </label>

        <div>
          <div className="text-xs text-[var(--pt-text-secondary)] mb-1">Platforms</div>
          <div className="flex gap-2 flex-wrap">
            {PLATFORM_OPTIONS.map((platform) => (
              <Button
                key={platform}
                variant={platforms.includes(platform) ? "primary" : "secondary"}
                size="sm"
                onClick={() => togglePlatform(platform)}
              >
                {platform}
              </Button>
            ))}
          </div>
        </div>

        <label className="text-xs text-[var(--pt-text-secondary)]">
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full bg-[var(--pt-surface-3)] border border-[var(--pt-border)] rounded px-3 py-2 text-sm text-[var(--pt-text-primary)] min-h-[64px]"
            placeholder="Optional release notes"
          />
        </label>

        <div className="flex gap-2 flex-wrap">
          <Button
            variant={dryRun ? "primary" : "secondary"}
            size="sm"
            onClick={() => setDryRun((v) => !v)}
          >
            Dry Run {dryRun ? "ON" : "OFF"}
          </Button>
          <Button
            variant={humanInLoop ? "primary" : "secondary"}
            size="sm"
            onClick={() => setHumanInLoop((v) => !v)}
          >
            Human-in-loop {humanInLoop ? "ON" : "OFF"}
          </Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button variant="primary" size="sm" disabled={running} onClick={() => void runAgent()}>
          {running ? "Running..." : "Run Agent Goal"}
        </Button>
        <Button variant="ghost" size="sm" disabled={!running} onClick={() => void abortAgent()}>
          Abort Agent
        </Button>
      </div>

      {status && <div className="text-sm text-[var(--pt-cyan)]">{status}</div>}

      {plan.length > 0 && (
        <div className="flex-1 min-h-0 overflow-auto border border-[var(--pt-border)] rounded-md p-2 bg-[var(--pt-surface-3)]">
          <div className="text-xs uppercase tracking-wide text-[var(--pt-text-muted)] mb-2">Plan</div>
          {plan.map((step) => (
            <div
              key={step.id}
              className={`text-sm py-1 px-2 rounded mb-1 ${
                currentStepId === step.id
                  ? "bg-[var(--pt-cyan-soft)] text-[var(--pt-cyan)]"
                  : "text-[var(--pt-text-secondary)]"
              }`}
            >
              {step.id}: {step.label}
              {step.requiresConfirmation ? " (confirm)" : ""}
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-[var(--pt-text-muted)]">{events.length} pipeline events recorded</div>
    </div>
  );
};
