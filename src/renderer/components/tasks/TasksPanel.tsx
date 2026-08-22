import React, { useCallback, useEffect, useMemo, useState } from "react";

import { useTranslation } from "../../../../ai/i18n/useTranslation";
import type { MessageKey } from "../../../../ai/i18n";
import type { Task, TaskRun, TasksApi } from "../../../shared/tasks-contract";
import { MAX_TASK_PANEL_LOG_LINES, takeLast } from "../../lib/panel-limits";
import { useEditorStore } from "../../store/editor-store";
import { useOutputStore } from "../../store/output-store";
import { useTerminalSuggestStore } from "../../store/terminal-suggest-store";
import { dispatchTerminalPanelTab } from "../../terminal/terminal-events";
import { showWorkbenchToast } from "../../commands/workbench-toast";

const STATUS_COLOR: Record<TaskRun["status"], string> = {
  starting: "#78B9E0",
  running: "#00E0FF",
  success: "#2FBF71",
  failed: "#EF4444",
  stopped: "#909090",
};

function statusLabelKey(status: TaskRun["status"]): MessageKey {
  switch (status) {
    case "starting":
      return "tasks.starting";
    case "running":
      return "tasks.running";
    case "success":
      return "tasks.completed";
    case "failed":
      return "tasks.failed";
    case "stopped":
      return "tasks.stopped";
    default:
      return "tasks.running";
  }
}

function getTasksApi(): TasksApi | undefined {
  const caval = window.caval as { tasks?: TasksApi } | undefined;
  return caval?.tasks;
}

function outputChannelName(taskName: string): string {
  return `Task: ${taskName}`;
}

export function TasksPanel() {
  const { t } = useTranslation();
  const projectPath = useEditorStore((s) => s.projectPath);
  const appendBlock = useOutputStore((s) => s.appendBlock);
  const setActiveChannel = useOutputStore((s) => s.setActiveChannel);
  const suggest = useTerminalSuggestStore((s) => s.suggest);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);

  useEffect(() => {
    const api = getTasksApi();
    if (!api) {
      setError(t("tasks.apiUnavailable"));
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
        setError(err instanceof Error ? err.message : t("tasks.listFailed"));
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
      setLogLines((prev) => takeLast([...prev, ...chunk.data.split(/\r?\n/)], MAX_TASK_PANEL_LOG_LINES));
    });

    return () => {
      cancelled = true;
      unsubscribeRun();
      unsubscribeOutput();
    };
  }, [appendBlock, projectPath, t]);

  const handleRun = useCallback(async (taskName: string) => {
    const api = getTasksApi();
    if (!api) return;
    setPendingName(taskName);
    setError(null);
    setActiveChannel(outputChannelName(taskName));
    try {
      await api.run(taskName);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("tasks.startFailed"));
    } finally {
      setPendingName(null);
    }
  }, [setActiveChannel, t]);

  const handleStop = useCallback(async (runId: string) => {
    const api = getTasksApi();
    if (!api) return;
    setError(null);
    try {
      await api.stop(runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("tasks.stopFailed"));
    }
  }, [t]);

  const handleSuggestFix = useCallback(
    (run: TaskRun) => {
      const errorOutput =
        logLines.slice(-40).join("\n").trim() ||
        `Task "${run.taskName}" failed with status ${run.status}`;
      dispatchTerminalPanelTab("terminal");
      void suggest({
        context: "task-failed",
        errorOutput,
        userQuery: `Fix failed task ${run.taskName}`,
      });
      showWorkbenchToast(t("tasks.suggesting"));
    },
    [logLines, suggest, t]
  );

  const activeRuns = useMemo(
    () => runs.filter((run) => run.status === "running" || run.status === "starting"),
    [runs]
  );

  return (
    <div
      className="tasks-panel"
      role="region"
      aria-label={t("tasks.title")}
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
        <h3 style={{ margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: 0.4 }}>{t("tasks.title")}</h3>
        <span style={{ color: "var(--caval-text-muted)", fontSize: 10.5 }}>
          {t("tasks.available", { count: tasks.length })}
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
            <p style={{ margin: 0 }}>{t("tasks.empty")}</p>
            <p style={{ margin: "6px 0 0", fontSize: 11 }} className="tasks-empty-hint">
              {t("tasks.emptyHint")}
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
                        aria-label={t("tasks.stopAria", { name: task.name })}
                        style={actionButtonStyle(true)}
                      >
                        {t("tasks.stop")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary"
                        data-testid="task-run-btn"
                        onClick={() => void handleRun(task.name)}
                        disabled={isPending}
                        aria-label={t("tasks.runAria", { name: task.name })}
                        style={actionButtonStyle(false)}
                      >
                        {isPending ? "…" : t("tasks.runShort")}
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
              {t("tasks.recentRuns")}
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
                    alignItems: "center",
                  }}
                >
                  <span className="task-run-name" style={{ color: "var(--caval-text)", minWidth: 0, flex: 1 }}>
                    {run.taskName}
                  </span>
                  <span className="task-run-status">{t(statusLabelKey(run.status))}</span>
                  <span className="task-run-time" style={{ color: "var(--caval-text-muted)" }}>
                    {new Date(run.startedAt).toLocaleTimeString()}
                  </span>
                  {run.status === "failed" && (
                    <button
                      type="button"
                      data-testid="task-suggest-fix-btn"
                      onClick={() => handleSuggestFix(run)}
                      style={{
                        border: "1px solid var(--caval-border)",
                        background: "transparent",
                        color: "var(--caval-text-muted)",
                        cursor: "pointer",
                        fontSize: 10,
                        borderRadius: 4,
                        padding: "2px 6px",
                      }}
                    >
                      {t("tasks.suggestFix")}
                    </button>
                  )}
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
            {logLines.map((line, index) => (
              <div key={`${index}-${line.slice(0, 24)}`} className="tasks-log-line">
                {line || "\u00a0"}
              </div>
            ))}
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
