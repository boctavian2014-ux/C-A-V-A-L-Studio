import React, { useCallback, useEffect, useMemo, useState } from "react";

import type { Task, TaskRun, TasksApi } from "../../../shared/tasks-contract";
import { useEditorStore } from "../../store/editor-store";
import { useOutputStore } from "../../store/output-store";

const STATUS_COLOR: Record<TaskRun["status"], string> = {
  starting: "#78B9E0",
  running: "#00E0FF",
  success: "#2FBF71",
  failed: "#EF4444",
  stopped: "#909090",
};

function getTasksApi(): TasksApi | undefined {
  const caval = window.caval as { tasks?: TasksApi } | undefined;
  return caval?.tasks;
}

function outputChannelName(taskName: string): string {
  return `Task: ${taskName}`;
}

export function TasksPanel() {
  const projectPath = useEditorStore((s) => s.projectPath);
  const appendBlock = useOutputStore((s) => s.appendBlock);
  const setActiveChannel = useOutputStore((s) => s.setActiveChannel);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);

  useEffect(() => {
    const api = getTasksApi();
    if (!api) {
      setError("Tasks API unavailable");
      return;
    }

    let cancelled = false;
    setError(null);

    void api.list().then(
      (next) => {
        if (!cancelled) setTasks(next);
      },
      (err: unknown) => {
        if (cancelled) return;
        setTasks([]);
        setError(err instanceof Error ? err.message : "Could not list tasks");
      }
    );
    void api.getRuns().then(
      (next) => {
        if (!cancelled) setRuns(next);
      },
      () => undefined
    );

    const unsubscribeRun = api.onRunChanged((run) => {
      if (cancelled) return;
      setRuns((prev) => {
        const existing = prev.findIndex((item) => item.id === run.id);
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = run;
          return next;
        }
        return [run, ...prev];
      });
    });

    const unsubscribeOutput = api.onOutput((chunk) => {
      if (cancelled) return;
      appendBlock(outputChannelName(chunk.taskName), chunk.data);
      setLogLines((prev) => [...prev, ...chunk.data.split(/\r?\n/)].slice(-200));
    });

    return () => {
      cancelled = true;
      unsubscribeRun();
      unsubscribeOutput();
    };
  }, [appendBlock, projectPath]);

  const handleRun = useCallback(async (taskName: string) => {
    const api = getTasksApi();
    if (!api) return;
    setPendingName(taskName);
    setError(null);
    setActiveChannel(outputChannelName(taskName));
    try {
      await api.run(taskName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Task failed to start");
    } finally {
      setPendingName(null);
    }
  }, [setActiveChannel]);

  const handleStop = useCallback(async (runId: string) => {
    const api = getTasksApi();
    if (!api) return;
    setError(null);
    try {
      await api.stop(runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stop task");
    }
  }, []);

  const activeRuns = useMemo(
    () => runs.filter((run) => run.status === "running" || run.status === "starting"),
    [runs]
  );

  return (
    <div
      className="tasks-panel"
      role="region"
      aria-label="Tasks"
      data-testid="tasks-panel"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        color: "var(--caval-text)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          borderBottom: "1px solid var(--caval-border)",
          flexShrink: 0,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: 0.4 }}>Tasks</h3>
        <span style={{ color: "var(--caval-text-muted)", fontSize: 10.5 }}>
          {tasks.length} available
        </span>
      </div>

      {error && (
        <div role="alert" data-testid="tasks-error" style={{ padding: "6px 12px", color: "#EF4444", fontSize: 11 }}>
          {error}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {tasks.length === 0 ? (
          <div data-testid="tasks-empty" style={{ padding: "12px 14px", color: "var(--caval-text-muted)" }}>
            <p style={{ margin: 0 }}>No tasks found.</p>
            <p style={{ margin: "6px 0 0", fontSize: 11 }} className="tasks-empty-hint">
              Add scripts to package.json to see them here.
            </p>
          </div>
        ) : (
          <div className="tasks-list" role="list" data-testid="tasks-list">
            {tasks.map((task) => {
              const activeRun = activeRuns.find((run) => run.taskName === task.name);
              const isPending = pendingName === task.name;
              return (
                <div
                  key={task.name}
                  className="task-item"
                  role="listitem"
                  data-testid="task-item"
                  data-task-name={task.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 14px",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <div className="task-info" style={{ minWidth: 0, flex: 1 }}>
                    <div className="task-name" style={{ color: "var(--caval-text)" }}>
                      {task.name}
                    </div>
                    <div
                      className="task-command"
                      title={task.command}
                      style={{
                        color: "var(--caval-text-muted)",
                        fontSize: 10.5,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {task.command}
                    </div>
                  </div>
                  <div className="task-actions" style={{ flexShrink: 0 }}>
                    {activeRun ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        data-testid="task-stop-btn"
                        onClick={() => void handleStop(activeRun.id)}
                        aria-label={`Stop ${task.name}`}
                        style={actionButtonStyle(true)}
                      >
                        Stop
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary"
                        data-testid="task-run-btn"
                        onClick={() => void handleRun(task.name)}
                        disabled={isPending}
                        aria-label={`Run ${task.name}`}
                        style={actionButtonStyle(false)}
                      >
                        {isPending ? "…" : "Run"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {runs.length > 0 && (
          <div className="tasks-history" data-testid="tasks-history" style={{ padding: "10px 14px 6px" }}>
            <h4 style={{ margin: "0 0 6px", fontSize: 10.5, color: "var(--caval-text-muted)" }}>
              Recent runs
            </h4>
            <div className="tasks-runs-list">
              {runs.slice(0, 10).map((run) => (
                <div
                  key={run.id}
                  className={`task-run task-run-${run.status}`}
                  data-testid="task-run"
                  data-run-status={run.status}
                  style={{
                    display: "flex",
                    gap: 10,
                    fontSize: 11,
                    padding: "3px 0",
                    color: STATUS_COLOR[run.status],
                  }}
                >
                  <span className="task-run-name" style={{ color: "var(--caval-text)", minWidth: 0, flex: 1 }}>
                    {run.taskName}
                  </span>
                  <span className="task-run-status">{run.status}</span>
                  <span className="task-run-time" style={{ color: "var(--caval-text-muted)" }}>
                    {new Date(run.startedAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {logLines.length > 0 && (
          <div
            data-testid="tasks-log"
            style={{
              margin: "8px 12px 12px",
              padding: 8,
              border: "1px solid var(--caval-border)",
              borderRadius: 4,
              maxHeight: 140,
              overflow: "auto",
              color: "var(--caval-text-muted)",
              fontSize: 11,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
            }}
          >
            {logLines.join("\n")}
          </div>
        )}
      </div>
    </div>
  );
}

function actionButtonStyle(stop: boolean): React.CSSProperties {
  return {
    height: 22,
    padding: "0 10px",
    border: stop ? "1px solid rgba(239,68,68,0.45)" : "1px solid rgba(0,224,255,0.35)",
    borderRadius: 4,
    background: stop ? "rgba(239,68,68,0.08)" : "rgba(0,224,255,0.08)",
    color: stop ? "#EF4444" : "var(--caval-accent)",
    cursor: "pointer",
    fontSize: 10.5,
    fontFamily: "'JetBrains Mono', monospace",
  };
}
