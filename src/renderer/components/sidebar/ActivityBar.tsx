import React from "react";

import {
  IconExplorer,
  IconSearch,
  IconGit,
  IconMarketplace,
  IconSparkle,
  IconSettings,
} from "../brand/CavaloIcons";
import { usePreviewStore } from "../../store/preview-store";
import type { PreviewStatus, PreviewTarget } from "../../../shared/preview-contract";

import webSidebarIcon from "../../../../assets/icons/3d/png_256/WEB SIDEBAR.jpg";
import mobileSidebarIcon from "../../../../assets/icons/3d/png_256/MOBILE SIDEBAR.jpg";

export type ActivityTab = "explorer" | "search" | "git" | "extensions" | "settings";

/** 3D PNG icons include a rounded black tile — render larger than line SVG icons. */
export const ACTIVITY_BAR_WIDTH = 48;
const ACTIVITY_BTN = 36;
const ACTIVITY_ICON = 26;

function getPreviewApi() {
  try {
    return window.caval?.preview ?? null;
  } catch {
    return null;
  }
}

function ActivityBarItem({
  title,
  active,
  onClick,
  children,
  status,
  statusDot,
  testId,
}: {
  title: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  status?: PreviewStatus;
  statusDot?: boolean;
  testId?: string;
}) {
  const tooltip =
    status === "not-configured"
      ? `${title} — Not configured`
      : status === "running"
        ? `${title} — Running`
        : status === "starting"
          ? `${title} — Starting`
          : status === "failed"
            ? `${title} — Failed`
            : title;

  return (
    <button
      type="button"
      title={tooltip}
      data-testid={testId}
      onClick={onClick}
      aria-pressed={active}
      className={`activity-bar-item${active ? " active" : ""}`}
      style={{
        width: ACTIVITY_BTN,
        height: ACTIVITY_BTN,
        borderRadius: 8,
        border: active ? "1px solid rgba(0,224,255,0.3)" : "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: active ? "rgba(255,255,255,0.1)" : "transparent",
        color: active ? "var(--caval-accent)" : "var(--caval-text-muted)",
        boxShadow: active ? "0 0 12px rgba(0,224,255,0.15)" : "none",
        transition: "all 0.15s",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "rgba(255,255,255,0.05)";
          e.currentTarget.style.color = "var(--caval-text)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--caval-text-muted)";
        }
      }}
    >
      {children}
      {active && (
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 6,
            bottom: 6,
            width: 3,
            borderRadius: "0 2px 2px 0",
            background: "var(--caval-accent)",
            boxShadow: "0 0 8px var(--caval-accent)",
          }}
        />
      )}
      {status === "not-configured" && (
        <span
          className="status-badge status-badge--muted"
          data-testid={`${testId}-badge-muted`}
          style={{
            position: "absolute",
            bottom: 2,
            right: 2,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "#E2C08D",
            color: "#0E0E0F",
            fontSize: 8,
            fontWeight: 700,
            lineHeight: "12px",
            textAlign: "center",
          }}
        >
          !
        </span>
      )}
      {status === "running" && (
        <span
          className="status-badge status-badge--live"
          data-testid={`${testId}-badge-live`}
          style={{
            position: "absolute",
            bottom: 2,
            right: 2,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#22C55E",
          }}
        />
      )}
      {statusDot && (
        <span
          className="glow-accent"
          data-testid={`${testId}-status-dot`}
          style={{
            position: "absolute",
            top: 3,
            right: 3,
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "var(--caval-accent)",
          }}
        />
      )}
    </button>
  );
}

export function togglePreviewFromRail(kind: PreviewTarget): void {
  const store = usePreviewStore.getState();
  const wasSame = store.previewPanelOpen && store.activePreview === kind;
  store.togglePreviewFromRail(kind);
  if (!wasSame) {
    void getPreviewApi()?.start(kind);
  }
}

export function ActivityBar({
  active,
  onChange,
  aiPanelOpen,
  onToggleAI,
  gitChangesCount,
  onOpenAccount,
}: {
  active: ActivityTab;
  onChange: (tab: ActivityTab) => void;
  aiPanelOpen: boolean;
  onToggleAI: () => void;
  gitChangesCount: number;
  onOpenAccount: () => void;
}) {
  const activePreview = usePreviewStore((s) => s.activePreview);
  const previewPanelOpen = usePreviewStore((s) => s.previewPanelOpen);
  const previewStatus = usePreviewStore((s) => s.previewStatus);

  const ITEMS: { id: ActivityTab; title: string; icon: React.ReactNode }[] = [
    {
      id: "explorer",
      title: "Explorer (Ctrl+Shift+E)",
      icon: <IconExplorer size={ACTIVITY_ICON} />,
    },
    {
      id: "search",
      title: "Căutare (Ctrl+Shift+F)",
      icon: <IconSearch size={ACTIVITY_ICON} />,
    },
    {
      id: "git",
      title: "Source Control (Ctrl+Shift+G)",
      icon: (
        <div style={{ position: "relative" }}>
          <IconGit size={ACTIVITY_ICON} />
          {gitChangesCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: -4,
                right: -5,
                background: "#E2C08D",
                color: "#0E0E0F",
                fontSize: 8,
                fontWeight: 700,
                lineHeight: 1,
                padding: "1px 3px",
                borderRadius: 99,
                minWidth: 12,
                textAlign: "center",
              }}
            >
              {gitChangesCount > 99 ? "99+" : gitChangesCount}
            </span>
          )}
        </div>
      ),
    },
    {
      id: "extensions",
      title: "Extensions (Ctrl+Shift+X)",
      icon: <IconMarketplace size={ACTIVITY_ICON} />,
    },
  ];

  const isSettingsActive = active === "settings";

  return (
    <div
      className="glass-panel activity-bar"
      data-testid="activity-bar"
      style={{
        width: ACTIVITY_BAR_WIDTH,
        borderRight: "1px solid var(--caval-glass-border, rgba(255,255,255,0.08))",
        borderTop: "none",
        borderBottom: "none",
        borderLeft: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "10px 0",
        gap: 4,
        flexShrink: 0,
        zIndex: 20,
        height: "100%",
      }}
    >
      {ITEMS.map((item) => (
        <ActivityBarItem
          key={item.id}
          title={item.title}
          active={active === item.id}
          onClick={() => onChange(item.id)}
          testId={`activity-${item.id}`}
        >
          {item.icon}
        </ActivityBarItem>
      ))}

      <div className="activity-bar-spacer" style={{ flex: 1, minHeight: 8 }} />

      <ActivityBarItem
        title="Web Preview"
        active={previewPanelOpen && activePreview === "web"}
        status={previewStatus.web}
        onClick={() => togglePreviewFromRail("web")}
        testId="activity-preview-web"
      >
        <img src={webSidebarIcon} alt="" width={ACTIVITY_ICON} height={ACTIVITY_ICON} />
      </ActivityBarItem>

      <ActivityBarItem
        title="Mobile Preview"
        active={previewPanelOpen && activePreview === "mobile"}
        status={previewStatus.mobile}
        onClick={() => togglePreviewFromRail("mobile")}
        testId="activity-preview-mobile"
      >
        <img src={mobileSidebarIcon} alt="" width={ACTIVITY_ICON} height={ACTIVITY_ICON} />
      </ActivityBarItem>

      <ActivityBarItem
        title="AI Panel Caval (Ctrl+Shift+A)"
        active={aiPanelOpen}
        statusDot={aiPanelOpen}
        onClick={onToggleAI}
        testId="activity-ai"
      >
        <span data-icon="ai">
          <IconSparkle size={ACTIVITY_ICON} />
        </span>
      </ActivityBarItem>

      <div
        style={{
          marginTop: 6,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
        }}
      >
        <ActivityBarItem
          title="Setări Caval (Ctrl+,)"
          active={isSettingsActive}
          onClick={() => onChange("settings")}
          testId="activity-settings"
        >
          <IconSettings size={ACTIVITY_ICON} />
        </ActivityBarItem>
        <button
          type="button"
          title="Cont & credite"
          onClick={onOpenAccount}
          style={{
            width: ACTIVITY_BTN,
            height: ACTIVITY_BTN,
            borderRadius: "50%",
            border: "none",
            background: "rgba(212,168,87,0.15)",
            color: "#D4A857",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          OB
        </button>
        <div
          className="glass-status-dot glow-emerald"
          title="Railway & MCP"
          aria-label="Status conexiune"
        />
      </div>
    </div>
  );
}
