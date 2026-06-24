import { useEffect, useState } from "react";
import { auditStore } from "../../ai/agent/audit-store";
import type { AgentAuditReport } from "../../ai/agent/types";
import { Button } from "./Button";
import { replayEvents } from "./logicflow/replay";
import { useLogicFlowStore } from "./logicflow/LogicFlowStore";

const statusColor = (status: string): string => {
  if (status === "success") return "text-green-400";
  if (status === "failed") return "text-red-400";
  if (status === "dry_run") return "text-[var(--pt-cyan)]";
  return "text-[var(--pt-text-secondary)]";
};

export const AgentAuditPanel = () => {
  const [audit, setAudit] = useState<AgentAuditReport | null>(auditStore.get());
  const events = useLogicFlowStore((state) => state.events);
  const setReplaying = useLogicFlowStore((state) => state.setReplaying);

  useEffect(() => auditStore.subscribe(() => setAudit(auditStore.get())), []);

  const replayByToken = async (): Promise<void> => {
    if (!audit || events.length === 0) return;
    setReplaying(true);
    try {
      await replayEvents(events, 2);
    } finally {
      setReplaying(false);
    }
  };

  if (!audit) {
    return (
      <div className="text-sm text-[var(--pt-text-secondary)]">
        No audit report yet. Run an agent goal to generate a full report.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full min-h-0 overflow-auto text-sm">
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-[var(--pt-text-primary)]">Agent Audit Report</h3>
          <p className="text-xs text-[var(--pt-text-secondary)] mt-1">
            {audit.dryRun ? "Dry run" : "Live run"} · {audit.ok ? "Success" : "Failed"}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void replayByToken()}>
          Replay ({audit.replayToken})
        </Button>
      </header>

      <section>
        <h4 className="text-[var(--pt-cyan)] font-semibold mb-2">Summary — per platform</h4>
        <div className="grid gap-1">
          {audit.summary.map((row) => (
            <div key={row.platform} className="flex justify-between bg-[var(--pt-surface-3)] rounded px-2 py-1">
              <span className="uppercase">{row.platform}</span>
              <span className={statusColor(row.status)}>{row.status}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h4 className="text-[var(--pt-cyan)] font-semibold mb-2">Timeline</h4>
        <div className="max-h-32 overflow-auto space-y-1">
          {audit.timeline.map((entry, i) => (
            <div key={`${entry.timestamp}-${i}`} className="text-xs text-[var(--pt-text-secondary)]">
              <span className="text-[var(--pt-text-muted)]">{new Date(entry.timestamp).toLocaleTimeString()}</span>
              {" · "}
              <span className="text-[var(--pt-cyan)]">{entry.type}</span>
              {" — "}
              {entry.label}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h4 className="text-[var(--pt-cyan)] font-semibold mb-2">Commands executed</h4>
        <div className="max-h-36 overflow-auto space-y-2">
          {audit.commands.map((cmd) => (
            <div key={cmd.id} className="bg-[var(--pt-surface-3)] rounded p-2 text-xs">
              <div className={cmd.success ? "text-green-400" : "text-red-400"}>
                {cmd.success ? "✔" : "✖"} {cmd.command}
                {cmd.dryRun ? " (dry run)" : ""}
              </div>
              <pre className="mt-1 text-[var(--pt-text-muted)] overflow-auto max-h-16">
                {JSON.stringify(cmd.output ?? {}, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h4 className="text-[var(--pt-cyan)] font-semibold mb-2">Patches</h4>
        {audit.patches.length === 0 ? (
          <p className="text-xs text-[var(--pt-text-secondary)]">No patches generated.</p>
        ) : (
          audit.patches.map((patch) => (
            <pre
              key={patch.path}
              className="bg-[var(--pt-surface-3)] rounded p-2 text-xs text-green-300 overflow-auto max-h-28 mb-2"
            >
              {patch.diff}
            </pre>
          ))
        )}
      </section>

      <section>
        <h4 className="text-[var(--pt-cyan)] font-semibold mb-2">Human actions required</h4>
        {audit.humanActionsRequired.length === 0 ? (
          <p className="text-xs text-[var(--pt-text-secondary)]">None.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {audit.humanActionsRequired.map((action) => (
              <li key={action.stepId} className="text-[var(--pt-text-secondary)]">
                <span className="text-[var(--pt-cyan)]">{action.label}</span>
                {" — "}
                {action.reason}
                {" ["}
                {action.status}
                {"]"}
              </li>
            ))}
          </ul>
        )}
      </section>

      {audit.unresolvedIssues.length > 0 && (
        <section>
          <h4 className="text-red-400 font-semibold mb-2">Unresolved issues</h4>
          <ul className="list-disc ml-4 text-xs text-red-300">
            {audit.unresolvedIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
