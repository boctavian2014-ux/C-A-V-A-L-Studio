import React, { useEffect } from "react";

import type { AiConfigurableToolName, AiSettings } from "../../src/shared/ai-settings-contract";
import {
  AI_SETTINGS_MESSAGE_CAP_MAX_KB,
  AI_SETTINGS_MESSAGE_CAP_MIN_KB,
  AI_SETTINGS_SNAPSHOT_CAP_MAX_KB,
  AI_SETTINGS_SNAPSHOT_CAP_MIN_KB,
} from "../../src/shared/ai-settings-contract";
import { useAiSettingsStore } from "../../src/renderer/store/ai-settings-store";

const TOOL_LABELS: Record<AiConfigurableToolName, string> = {
  get_problems: "Read diagnostics (no edits)",
  git_status: "Read git status (no commits)",
  run_task: "Run package.json scripts only",
  open_preview: "Open web/mobile preview",
};

export function AiSettingsPanel({ onClose }: { onClose?: () => void }): React.ReactElement {
  const settings = useAiSettingsStore((s) => s.settings);
  const loading = useAiSettingsStore((s) => s.loading);
  const error = useAiSettingsStore((s) => s.error);
  const refresh = useAiSettingsStore((s) => s.refresh);
  const update = useAiSettingsStore((s) => s.update);
  const reset = useAiSettingsStore((s) => s.reset);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    fontSize: 12,
    color: "var(--caval-text)",
    marginBottom: 8,
  };

  const sectionTitle: React.CSSProperties = {
    margin: "14px 0 8px",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--caval-text-muted)",
  };

  return (
    <div
      className="ai-settings-panel"
      data-testid="ai-settings-panel"
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "12px 14px 20px",
        color: "var(--caval-text)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>AI settings</h3>
        {onClose && (
          <button
            type="button"
            data-testid="ai-settings-close"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              color: "var(--caval-text-muted)",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ← Back
          </button>
        )}
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--caval-text-muted)", lineHeight: 1.45 }}>
        Preferences only. Diff preview, native undo, and multi-file refactor confirmation stay
        mandatory.
      </p>

      <h4 style={sectionTitle}>AI Tools</h4>
      {(Object.keys(settings.toolsEnabled) as AiConfigurableToolName[]).map((tool) => (
        <label key={tool} className="settings-row" style={rowStyle}>
          <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <code style={{ fontSize: 11 }}>{tool}</code>
            <span style={{ fontSize: 10, color: "var(--caval-text-muted)" }}>{TOOL_LABELS[tool]}</span>
          </span>
          <input
            type="checkbox"
            data-testid={`ai-settings-tool-${tool}`}
            checked={settings.toolsEnabled[tool]}
            disabled={loading}
            onChange={(e) =>
              void update({
                toolsEnabled: { ...settings.toolsEnabled, [tool]: e.target.checked },
              })
            }
          />
        </label>
      ))}

      <h4 style={sectionTitle}>Redaction Level</h4>
      <select
        data-testid="ai-settings-redaction"
        value={settings.redactionLevel}
        disabled={loading}
        onChange={(e) =>
          void update({
            redactionLevel: e.target.value as AiSettings["redactionLevel"],
          })
        }
        style={{
          width: "100%",
          fontSize: 12,
          padding: "6px 8px",
          borderRadius: 4,
          border: "1px solid var(--caval-border)",
          background: "var(--caval-surface-raised)",
          color: "var(--caval-text)",
        }}
      >
        <option value="strict">Strict (redact more)</option>
        <option value="standard">Standard</option>
        <option value="minimal">Minimal (critical secrets only)</option>
      </select>

      <h4 style={sectionTitle}>Storage Caps</h4>
      <label className="settings-row" style={rowStyle}>
        Message cap (KB)
        <input
          type="number"
          data-testid="ai-settings-message-cap"
          min={AI_SETTINGS_MESSAGE_CAP_MIN_KB}
          max={AI_SETTINGS_MESSAGE_CAP_MAX_KB}
          value={settings.messageCapKB}
          disabled={loading}
          onChange={(e) => void update({ messageCapKB: Number(e.target.value) })}
          style={{ width: 72, fontSize: 12, padding: "4px 6px" }}
        />
      </label>
      <label className="settings-row" style={rowStyle}>
        Snapshot cap (KB)
        <input
          type="number"
          data-testid="ai-settings-snapshot-cap"
          min={AI_SETTINGS_SNAPSHOT_CAP_MIN_KB}
          max={AI_SETTINGS_SNAPSHOT_CAP_MAX_KB}
          value={settings.snapshotCapKB}
          disabled={loading}
          onChange={(e) => void update({ snapshotCapKB: Number(e.target.value) })}
          style={{ width: 72, fontSize: 12, padding: "4px 6px" }}
        />
      </label>

      <h4 style={sectionTitle}>Timeline Detail</h4>
      <select
        data-testid="ai-settings-timeline-detail"
        value={settings.timelineDetail}
        disabled={loading}
        onChange={(e) =>
          void update({
            timelineDetail: e.target.value as AiSettings["timelineDetail"],
          })
        }
        style={{
          width: "100%",
          fontSize: 12,
          padding: "6px 8px",
          borderRadius: 4,
          border: "1px solid var(--caval-border)",
          background: "var(--caval-surface-raised)",
          color: "var(--caval-text)",
        }}
      >
        <option value="compact">Compact</option>
        <option value="verbose">Verbose</option>
      </select>

      <button
        type="button"
        data-testid="ai-settings-reset"
        disabled={loading}
        onClick={() => void reset()}
        style={{
          marginTop: 18,
          width: "100%",
          padding: "8px 10px",
          borderRadius: 6,
          border: "1px solid var(--caval-border)",
          background: "transparent",
          color: "var(--caval-text)",
          cursor: loading ? "wait" : "pointer",
          fontSize: 12,
        }}
      >
        Reset to defaults
      </button>

      {error && (
        <p role="alert" style={{ marginTop: 10, fontSize: 11, color: "var(--caval-error)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
