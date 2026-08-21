import { useCallback, useEffect, useState, type MouseEvent } from "react";

import { useTranslation } from "../../../../ai/i18n/useTranslation";
import type {
  PreviewApi,
  PreviewLogLine,
  PreviewState,
  PreviewTarget,
} from "../../../shared/preview-contract";
import { idlePreviewState } from "../../../shared/preview-contract";
import { MAX_PREVIEW_LOG_LINES, takeLast } from "../../lib/panel-limits";
import { useEditorStore } from "../../store/editor-store";
import { usePreviewStore } from "../../store/preview-store";

function getPreviewApi(): PreviewApi | null {
  try {
    return window.caval?.preview ?? null;
  } catch {
    return null;
  }
}

function StatusBadge({
  status,
  testId,
}: {
  status: PreviewState["status"];
  testId: string;
}) {
  const { t } = useTranslation();
  const labelMap: Record<PreviewState["status"], string> = {
    "not-configured": t("preview.status.notConfigured"),
    stopped: t("preview.status.stopped"),
    starting: t("preview.status.starting"),
    running: t("preview.status.running"),
    failed: t("preview.status.failed"),
  };
  return (
    <span className={`status-badge status-badge-${status}`} data-testid={testId}>
      {labelMap[status]}
    </span>
  );
}

function TargetControls({ target, label }: { target: PreviewTarget; label: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<PreviewState | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<PreviewLogLine[]>([]);
  const [apiMissing, setApiMissing] = useState(false);
  const activatePreview = usePreviewStore((s) => s.activatePreview);
  const clearPreview = usePreviewStore((s) => s.clearPreview);
  const setPreviewStatus = usePreviewStore((s) => s.setPreviewStatus);
  const activePreview = usePreviewStore((s) => s.activePreview);

  useEffect(() => {
    const api = getPreviewApi();
    if (!api) {
      setApiMissing(true);
      setState(idlePreviewState(target));
      setPreviewStatus(target, "not-configured");
      return;
    }

    let cancelled = false;
    setApiMissing(false);
    void api
      .getState(target)
      .then((next) => {
        if (!cancelled) {
          setState(next);
          setPreviewStatus(target, next.status);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState(idlePreviewState(target));
          setPreviewStatus(target, "not-configured");
        }
      });
    const unsubscribeState = api.onStateChange((next) => {
      if (next.target !== target) return;
      setState(next);
      setPreviewStatus(target, next.status);
      if (next.status === "running" && next.url) {
        activatePreview(target, next.url);
      } else if (
        usePreviewStore.getState().activePreview === target &&
        (next.status === "stopped" || next.status === "failed" || next.status === "not-configured")
      ) {
        // Keep panel open for not-configured / failed messaging; clear URL only.
        if (next.status === "stopped") {
          clearPreview();
        } else {
          usePreviewStore.getState().setPreviewUrl(null);
        }
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
  }, [target, activatePreview, clearPreview, setPreviewStatus]);

  const handleStart = useCallback(() => {
    activatePreview(target, null);
    void getPreviewApi()
      ?.start(target)
      .then((next) => {
        setState(next);
        setPreviewStatus(target, next.status);
        if (next.url) activatePreview(target, next.url);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        setState({
          target,
          status: "failed",
          url: null,
          pid: null,
          startedAt: null,
          lastError: message.includes("Open a folder")
            ? t("preview.openFolder")
            : message,
        });
        setPreviewStatus(target, "failed");
      });
  }, [target, activatePreview, setPreviewStatus, t]);

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
            aria-label={t("preview.open", { label })}
          >
            {t("preview.open", { label })}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="preview-secondary-btn"
              data-testid={`preview-${target}-restart`}
              onClick={handleRestart}
              disabled={apiMissing}
              aria-label={t("preview.restartAria", { label })}
            >
              {t("preview.restart")}
            </button>
            <button
              type="button"
              className="preview-ghost-btn"
              data-testid={`preview-${target}-stop`}
              onClick={handleStop}
              disabled={apiMissing}
              aria-label={t("preview.stopAria", { label })}
            >
              {t("preview.stop")}
            </button>
          </>
        )}
        <button
          type="button"
          className="preview-ghost-btn"
          data-testid={`preview-${target}-logs`}
          onClick={() => void handleToggleLogs()}
          disabled={apiMissing}
          aria-label={t("preview.logsAria", { label })}
        >
          {t("preview.logs")}
        </button>
        {(status === "not-configured" || apiMissing) && (
          <button
            type="button"
            className="preview-ghost-btn"
            data-testid={`preview-${target}-config`}
            onClick={() => void getPreviewApi()?.openConfig()}
            disabled={apiMissing}
          >
            {t("preview.configure")}
          </button>
        )}
      </div>

      {apiMissing && (
        <p className="preview-target-error" role="status">
          {t("preview.apiMissing")}
        </p>
      )}

      {status === "not-configured" && !apiMissing && (
        <p className="preview-target-hint" data-testid={`preview-${target}-not-configured-msg`}>
          {t("preview.notConfigured", { label })}
        </p>
      )}

      {status === "starting" && (
        <p className="preview-target-hint">{t("preview.starting", { label })}</p>
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
            <p className="preview-target-logs-empty">{t("preview.noLogs")}</p>
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

function PreviewFrame() {
  const { t } = useTranslation();
  const activePreview = usePreviewStore((s) => s.activePreview);
  const previewUrl = usePreviewStore((s) => s.previewUrl);
  const previewStatus = usePreviewStore((s) => s.previewStatus);
  const projectPath = useEditorStore((s) => s.projectPath);

  if (!activePreview) {
    return (
      <div className="preview-empty" data-testid="preview-frame-empty">
        <p>{t("preview.selectTarget")}</p>
      </div>
    );
  }

  const label = activePreview === "web" ? t("preview.web") : t("preview.mobile");

  if (!projectPath?.trim()) {
    return (
      <div className="preview-empty" data-testid="preview-frame-no-folder">
        <p>{t("preview.openFolder")}</p>
        <p style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
          {t("preview.openFolderHint")}
        </p>
      </div>
    );
  }

  if (!previewUrl) {
    const status = previewStatus[activePreview];
    return (
      <div className="preview-empty" data-testid="preview-frame-waiting">
        <p>
          {status === "failed"
            ? t("preview.failedDetail", { label })
            : status === "not-configured"
              ? t("preview.notConfiguredShort", { label })
              : t("preview.starting", { label })}
        </p>
      </div>
    );
  }

  const refresh = () => {
    void getPreviewApi()?.restart(activePreview);
  };

  return (
    <div className={`preview-frame-host preview-${activePreview}`} data-testid="preview-frame-host">
      <div className="preview-toolbar">
        <span className="preview-type">{label}</span>
        <span className="preview-url" title={previewUrl}>
          {previewUrl}
        </span>
        <button type="button" className="preview-ghost-btn" onClick={refresh} title={t("preview.refresh")}>
          ↻
        </button>
      </div>
      <div className="preview-frame-container">
        <iframe
          src={previewUrl}
          className={
            activePreview === "mobile" ? "preview-frame-mobile" : "preview-frame-web"
          }
          title={t("preview.iframeTitle", { label })}
          data-testid="preview-iframe"
        />
      </div>
    </div>
  );
}

/**
 * Content-area preview panel (opened from activity-bar Web/Mobile icons).
 * Explorer no longer hosts this UI.
 */
export function PreviewContentPanel() {
  const { t } = useTranslation();
  const activePreview = usePreviewStore((s) => s.activePreview);
  const previewPanelOpen = usePreviewStore((s) => s.previewPanelOpen);
  const clearPreview = usePreviewStore((s) => s.clearPreview);

  if (!previewPanelOpen || !activePreview) return null;

  const label = activePreview === "web" ? t("preview.web") : t("preview.mobile");

  return (
    <div
      className="preview-content-panel"
      role="region"
      aria-label={t("preview.panelAria", { label })}
      data-testid="preview-content-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        background: "var(--caval-bg, #0E0E0F)",
        borderLeft: "1px solid var(--caval-border)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid var(--caval-border)",
          flexShrink: 0,
        }}
      >
        <strong style={{ fontSize: 12 }}>
          {activePreview === "web" ? t("preview.webPreview") : t("preview.mobilePreview")}
        </strong>
        <button
          type="button"
          className="preview-ghost-btn"
          data-testid="preview-content-close"
          onClick={() => clearPreview()}
          aria-label={t("preview.close")}
          style={{
            marginLeft: "auto",
            border: "none",
            background: "transparent",
            color: "var(--caval-text-muted)",
            cursor: "pointer",
            fontSize: 16,
          }}
        >
          ×
        </button>
      </div>
      <div style={{ padding: "10px 12px", flexShrink: 0, overflow: "auto" }}>
        <TargetControls target={activePreview} label={label} />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <PreviewFrame />
      </div>
    </div>
  );
}

