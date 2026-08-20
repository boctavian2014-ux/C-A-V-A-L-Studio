import { useCallback, useEffect, useState, type MouseEvent } from "react";

import type {
  PreviewApi,
  PreviewLogLine,
  PreviewState,
  PreviewTarget,
} from "../../../shared/preview-contract";
import { idlePreviewState } from "../../../shared/preview-contract";
import { MAX_PREVIEW_LOG_LINES, takeLast } from "../../lib/panel-limits";
import { usePreviewStore } from "../../store/preview-store";

import webSidebarIcon from "../../../../assets/icons/3d/png_256/WEB SIDEBAR.jpg";
import mobileSidebarIcon from "../../../../assets/icons/3d/png_256/MOBILE SIDEBAR.jpg";

interface TargetPanelProps {
  target: PreviewTarget;
  label: string;
}

function getPreviewApi(): PreviewApi | null {
  try {
    const preview = window.caval?.preview;
    return preview ?? null;
  } catch {
    return null;
  }
}

function TargetPanel({ target, label }: TargetPanelProps) {
  const [state, setState] = useState<PreviewState | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<PreviewLogLine[]>([]);
  const [apiMissing, setApiMissing] = useState(false);
  const activatePreview = usePreviewStore((s) => s.activatePreview);
  const clearPreview = usePreviewStore((s) => s.clearPreview);
  const activePreview = usePreviewStore((s) => s.activePreview);

  useEffect(() => {
    const api = getPreviewApi();
    if (!api) {
      setApiMissing(true);
      setState(idlePreviewState(target));
      return;
    }

    let cancelled = false;
    setApiMissing(false);
    void api
      .getState(target)
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) setState(idlePreviewState(target));
      });
    const unsubscribeState = api.onStateChange((next) => {
      if (next.target !== target) return;
      setState(next);
      // Pas M5 open_preview / launcher → sync UI store when this target runs.
      if (next.status === "running" && next.url) {
        activatePreview(target, next.url);
      } else if (
        usePreviewStore.getState().activePreview === target &&
        (next.status === "stopped" || next.status === "failed" || next.status === "not-configured")
      ) {
        clearPreview();
      }
    });
    const unsubscribeLog = api.onLog((line) => {
      if (line.target === target) {
        setLogs((prev) => takeLast([...prev, line], MAX_PREVIEW_LOG_LINES));
      }
    });
    return () => {
      cancelled = true;
      unsubscribeState();
      unsubscribeLog();
    };
  }, [target, activatePreview, clearPreview]);

  const handleStart = useCallback(() => {
    activatePreview(target, null);
    void getPreviewApi()?.start(target);
  }, [target, activatePreview]);

  const handleStop = useCallback(() => {
    void getPreviewApi()?.stop(target);
    if (activePreview === target) clearPreview();
  }, [target, activePreview, clearPreview]);

  const handleRestart = useCallback(() => {
    activatePreview(target, null);
    void getPreviewApi()?.restart(target);
  }, [target, activatePreview]);

  const handleToggleLogs = useCallback(async () => {
    const api = getPreviewApi();
    if (!showLogs && api) {
      const existing = await api.getLogs(target);
      setLogs(takeLast(existing, MAX_PREVIEW_LOG_LINES));
    }
    setShowLogs((open) => !open);
  }, [target, showLogs]);

  const handleOpenUrl = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      void getPreviewApi()?.openUrl(target);
    },
    [target]
  );

  const status = state?.status ?? "stopped";
  const showOpen = status === "stopped" || status === "failed" || status === "not-configured";

  return (
    <div className="preview-target-panel" data-status={status} data-testid={`preview-${target}`}>
      <div className="preview-target-header">
        <span className="preview-target-label">{label}</span>
        <StatusBadge status={status} testId={`preview-${target}-status`} />
      </div>

      <div className="preview-target-actions">
        {showOpen ? (
          <button
            type="button"
            className="preview-open-btn"
            data-testid={`preview-${target}-start`}
            onClick={handleStart}
            disabled={apiMissing}
            aria-label={`Open ${label}`}
          >
            Open {label}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="preview-secondary-btn"
              data-testid={`preview-${target}-restart`}
              onClick={handleRestart}
              disabled={apiMissing}
              aria-label={`Restart ${label} preview`}
            >
              Restart
            </button>
            <button
              type="button"
              className="preview-ghost-btn"
              data-testid={`preview-${target}-stop`}
              onClick={handleStop}
              disabled={apiMissing}
              aria-label={`Stop ${label} preview`}
            >
              Stop
            </button>
          </>
        )}
        <button
          type="button"
          className="preview-ghost-btn"
          data-testid={`preview-${target}-logs`}
          onClick={() => void handleToggleLogs()}
          disabled={apiMissing}
          aria-label={`Toggle logs for ${label}`}
        >
          Logs
        </button>
        {(status === "not-configured" || apiMissing) && (
          <button
            type="button"
            className="preview-ghost-btn"
            data-testid={`preview-${target}-config`}
            onClick={() => void getPreviewApi()?.openConfig()}
            disabled={apiMissing}
          >
            Configure in caval.jsonc
          </button>
        )}
      </div>

      {apiMissing && (
        <p className="preview-target-error" role="status">
          Restart CAVAL Studio after webpack finishes so Preview can start.
        </p>
      )}

      {status === "not-configured" && !apiMissing && (
        <p className="preview-target-hint">
          {label} preview is not configured. Open still tries detection, or add preview in caval.jsonc.
        </p>
      )}

      {status === "starting" && (
        <p className="preview-target-hint">{label} preview is starting…</p>
      )}

      {state?.url && status === "running" && (
        <a
          href={state.url}
          target="_blank"
          rel="noopener noreferrer"
          className="preview-target-url"
          data-testid={`preview-${target}-url`}
          onClick={handleOpenUrl}
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
        <div
          className="preview-target-logs"
          role="log"
          aria-live="polite"
          data-testid={`preview-${target}-log-content`}
        >
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

function StatusBadge({
  status,
  testId,
}: {
  status: PreviewState["status"];
  testId: string;
}) {
  const labelMap: Record<PreviewState["status"], string> = {
    "not-configured": "Not configured",
    stopped: "Stopped",
    starting: "Starting…",
    running: "Running",
    failed: "Failed",
  };
  return (
    <span className={`status-badge status-badge-${status}`} data-testid={testId}>
      {labelMap[status]}
    </span>
  );
}

function PreviewIconButtons() {
  const activePreview = usePreviewStore((s) => s.activePreview);
  const activatePreview = usePreviewStore((s) => s.activatePreview);

  const select = (target: PreviewTarget) => {
    activatePreview(target, null);
    void getPreviewApi()?.start(target);
  };

  return (
    <div className="sidebar-icons" data-testid="preview-sidebar-icons">
      <button
        type="button"
        className={`sidebar-icon-btn${activePreview === "web" ? " active" : ""}`}
        data-testid="preview-icon-web"
        onClick={() => select("web")}
        title="Web Preview"
        aria-label="Web Preview"
        aria-pressed={activePreview === "web"}
      >
        <img src={webSidebarIcon} alt="" width={32} height={32} />
      </button>
      <button
        type="button"
        className={`sidebar-icon-btn${activePreview === "mobile" ? " active" : ""}`}
        data-testid="preview-icon-mobile"
        onClick={() => select("mobile")}
        title="Mobile Preview"
        aria-label="Mobile Preview"
        aria-pressed={activePreview === "mobile"}
      >
        <img src={mobileSidebarIcon} alt="" width={32} height={32} />
      </button>
    </div>
  );
}

function PreviewFrame() {
  const activePreview = usePreviewStore((s) => s.activePreview);
  const previewUrl = usePreviewStore((s) => s.previewUrl);

  if (!activePreview) {
    return (
      <div className="preview-empty" data-testid="preview-frame-empty">
        <p>Select Web or Mobile preview</p>
      </div>
    );
  }

  if (!previewUrl) {
    return (
      <div className="preview-empty" data-testid="preview-frame-waiting">
        <p>Starting {activePreview} preview…</p>
      </div>
    );
  }

  const refresh = () => {
    void getPreviewApi()?.restart(activePreview);
  };

  return (
    <div className={`preview-frame-host preview-${activePreview}`} data-testid="preview-frame-host">
      <div className="preview-toolbar">
        <span className="preview-type">{activePreview === "web" ? "Web" : "Mobile"}</span>
        <span className="preview-url" title={previewUrl}>
          {previewUrl}
        </span>
        <button type="button" className="preview-ghost-btn" onClick={refresh} title="Refresh">
          ↻
        </button>
      </div>
      <div className="preview-frame-container">
        <iframe
          src={previewUrl}
          className={
            activePreview === "mobile" ? "preview-frame-mobile" : "preview-frame-web"
          }
          title={`${activePreview} preview`}
          data-testid="preview-iframe"
        />
      </div>
    </div>
  );
}

export function PreviewPanel() {
  return (
    <div className="preview-panel" role="region" aria-label="Preview">
      <h3 className="preview-panel-title">Preview</h3>
      <PreviewIconButtons />
      <TargetPanel target="web" label="Web" />
      <TargetPanel target="mobile" label="Mobile" />
      <PreviewFrame />
    </div>
  );
}
