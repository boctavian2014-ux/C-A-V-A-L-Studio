import { useCallback, useEffect, useState } from "react";

import type {
  PreviewLogLine,
  PreviewState,
  PreviewTarget,
} from "../../../shared/preview-contract";

interface TargetPanelProps {
  target: PreviewTarget;
  label: string;
}

function previewApi() {
  return window.caval.preview;
}

function TargetPanel({ target, label }: TargetPanelProps) {
  const [state, setState] = useState<PreviewState | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<PreviewLogLine[]>([]);

  useEffect(() => {
    let cancelled = false;
    void previewApi()
      .getState(target)
      .then((next) => {
        if (!cancelled) setState(next);
      });
    const unsubscribeState = previewApi().onStateChange((next) => {
      if (next.target === target) setState(next);
    });
    const unsubscribeLog = previewApi().onLog((line) => {
      if (line.target === target) {
        setLogs((prev) => [...prev.slice(-199), line]);
      }
    });
    return () => {
      cancelled = true;
      unsubscribeState();
      unsubscribeLog();
    };
  }, [target]);

  const handleStart = useCallback(() => {
    void previewApi().start(target);
  }, [target]);

  const handleStop = useCallback(() => {
    void previewApi().stop(target);
  }, [target]);

  const handleRestart = useCallback(() => {
    void previewApi().restart(target);
  }, [target]);

  const handleToggleLogs = useCallback(async () => {
    if (!showLogs) {
      const existing = await previewApi().getLogs(target);
      setLogs(existing);
    }
    setShowLogs((open) => !open);
  }, [target, showLogs]);

  const status = state?.status ?? "stopped";

  return (
    <div className="preview-target-panel" data-status={status}>
      <div className="preview-target-header">
        <span className="preview-target-label">{label}</span>
        <StatusBadge status={status} />
      </div>

      {status === "not-configured" ? (
        <div className="preview-target-empty">
          <p>{label} preview is not configured.</p>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => void previewApi().openConfig()}
          >
            Configure in caval.jsonc
          </button>
        </div>
      ) : (
        <div className="preview-target-actions">
          {status === "stopped" || status === "failed" ? (
            <button
              type="button"
              className="btn-primary"
              onClick={handleStart}
              aria-label={`Start ${label} preview`}
            >
              Start
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleRestart}
                aria-label={`Restart ${label} preview`}
              >
                Restart
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={handleStop}
                aria-label={`Stop ${label} preview`}
              >
                Stop
              </button>
            </>
          )}
          <button
            type="button"
            className="btn-icon"
            onClick={() => void handleToggleLogs()}
            aria-label={`Toggle logs for ${label}`}
          >
            Logs
          </button>
        </div>
      )}

      {state?.url && status === "running" && (
        <a
          href={state.url}
          target="_blank"
          rel="noopener noreferrer"
          className="preview-target-url"
        >
          {state.url}
        </a>
      )}

      {state?.lastError && (
        <p className="preview-target-error" role="alert">
          {state.lastError}
        </p>
      )}

      {showLogs && (
        <div className="preview-target-logs" role="log" aria-live="polite">
          {logs.length === 0 ? (
            <p className="preview-target-logs-empty">No logs yet.</p>
          ) : (
            logs.map((line, index) => (
              <div key={`${line.timestamp}-${index}`} className={`log-line log-line-${line.stream}`}>
                {line.line}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: PreviewState["status"] }) {
  const labelMap: Record<PreviewState["status"], string> = {
    "not-configured": "Not configured",
    stopped: "Stopped",
    starting: "Starting…",
    running: "Running",
    failed: "Failed",
  };
  return <span className={`status-badge status-badge-${status}`}>{labelMap[status]}</span>;
}

export function PreviewPanel() {
  return (
    <div className="preview-panel" role="region" aria-label="Preview">
      <h3 className="preview-panel-title">Preview</h3>
      <TargetPanel target="web" label="Web" />
      <TargetPanel target="mobile" label="Mobile" />
    </div>
  );
}
