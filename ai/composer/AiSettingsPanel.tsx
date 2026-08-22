import React, { useEffect } from "react";

import type { AiConfigurableToolName, AiSettings } from "../../src/shared/ai-settings-contract";
import {
  AI_SETTINGS_MESSAGE_CAP_MAX_KB,
  AI_SETTINGS_MESSAGE_CAP_MIN_KB,
  AI_SETTINGS_SNAPSHOT_CAP_MAX_KB,
  AI_SETTINGS_SNAPSHOT_CAP_MIN_KB,
} from "../../src/shared/ai-settings-contract";
import { useAiSettingsStore } from "../../src/renderer/store/ai-settings-store";
import { useTranslation } from "../i18n/useTranslation";
import type { MessageKey } from "../i18n/index";

const TOOL_KEYS: Record<AiConfigurableToolName, MessageKey> = {
  get_problems: "ai.settings.tool.get_problems",
  git_status: "ai.settings.tool.git_status",
  run_task: "ai.settings.tool.run_task",
  open_preview: "ai.settings.tool.open_preview",
};

export function AiSettingsPanel({ onClose }: { onClose?: () => void }): React.ReactElement {
  const { t } = useTranslation();
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
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{t("ai.settings.title")}</h3>
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
            ← {t("common.back")}
          </button>
        )}
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--caval-text-muted)", lineHeight: 1.45 }}>
        {t("ai.settings.intro")}
      </p>

      <h4 style={sectionTitle}>{t("ai.settings.tools")}</h4>
      {(Object.keys(settings.toolsEnabled) as AiConfigurableToolName[]).map((tool) => (
        <label key={tool} className="settings-row" style={rowStyle}>
          <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <code style={{ fontSize: 11 }}>{tool}</code>
            <span style={{ fontSize: 10, color: "var(--caval-text-muted)" }}>
              {t(TOOL_KEYS[tool])}
            </span>
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

      <h4 style={sectionTitle}>{t("ai.settings.redaction")}</h4>
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
        <option value="strict">{t("ai.settings.redaction.strict")}</option>
        <option value="standard">{t("ai.settings.redaction.standard")}</option>
        <option value="minimal">{t("ai.settings.redaction.minimal")}</option>
      </select>

      <h4 style={sectionTitle}>{t("ai.settings.storage")}</h4>
      <label className="settings-row" style={rowStyle}>
        {t("ai.settings.messageCap")}
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
        {t("ai.settings.snapshotCap")}
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

      <h4 style={sectionTitle}>{t("ai.settings.timeline")}</h4>
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
        <option value="compact">{t("ai.settings.timeline.compact")}</option>
        <option value="verbose">{t("ai.settings.timeline.verbose")}</option>
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
        {t("ai.settings.reset")}
      </button>

      {error && (
        <p role="alert" style={{ marginTop: 10, fontSize: 11, color: "var(--caval-error)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
