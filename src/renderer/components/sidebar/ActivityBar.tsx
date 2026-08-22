import React from "react";

import {
  IconExplorer,
  IconSearch,
  IconGit,
  IconMarketplace,
  IconSparkle,
  IconSettings,
  IconEngineering,
} from "../brand/CavaloIcons";
import { usePreviewStore } from "../../store/preview-store";
import { useEditorStore } from "../../store/editor-store";
import type { PreviewStatus, PreviewTarget } from "../../../shared/preview-contract";
import { useTranslation } from "../../../../ai/i18n/useTranslation";

import webSidebarIcon from "../../../../assets/icons/3d/png_256/WEB SIDEBAR.png";
import mobileSidebarIcon from "../../../../assets/icons/3d/png_256/MOBILE SIDEBAR.png";

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

function ActivityBarSeparator() {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      data-testid="activity-bar-separator"
      style={{
        width: 28,
        height: 1,
        background: "rgba(255,255,255,0.07)",
        margin: "2px 0",
        flexShrink: 0,
      }}
    />
  );
}

function ActivityBarItem({
  title,
  active,
  onClick,
  children,
  status,
  statusDot,
  testId,
  statusLabel,
  badgeAriaLabel,
}: {
  title: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  status?: PreviewStatus;
  statusDot?: boolean;
  testId?: string;
  statusLabel?: (title: string, status: PreviewStatus) => string;
  badgeAriaLabel?: string;
}) {
  const tooltip =
    status && statusLabel
      ? statusLabel(title, status)
      : status === "not-configured"
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
      aria-current={active ? "page" : undefined}
      className={`activity-bar-item${active ? " active" : ""}`}
      style={{
        width: ACTIVITY_BTN,
        height: ACTIVITY_BTN,
        borderRadius: 8,
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: active ? "rgba(0,224,255,0.08)" : "transparent",
        color: active ? "var(--caval-accent)" : "var(--caval-text-muted)",
        transition: "background 0.15s, color 0.15s",
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
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: 8,
            bottom: 8,
            width: 2,
            borderRadius: "0 2px 2px 0",
            background: "var(--caval-accent)",
            boxShadow: "0 0 6px rgba(0,224,255,0.45)",
          }}
        />
      )}
      {status === "not-configured" && (
        <span
          className="status-badge status-badge--muted"
          data-testid={`${testId}-badge-muted`}
          aria-label={badgeAriaLabel ?? `${title} — not configured`}
          role="img"
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
          aria-hidden
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
          aria-hidden
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
  if (wasSame) return;

  const projectPath = useEditorStore.getState().projectPath?.trim();
  if (!projectPath) {
    store.setPreviewStatus(kind, "failed");
    return;
  }

  void getPreviewApi()
    ?.start(kind)
    .then((state) => {
      store.setPreviewStatus(kind, state.status);
      if (state.url) store.setPreviewUrl(state.url);
    })
    .catch(() => {
      store.setPreviewStatus(kind, "failed");
    });
}

export function ActivityBar({
  active,
  onChange,
  aiPanelOpen,
  onToggleAI,
  gitChangesCount,
  engineeringOpen,
  onToggleEngineering,
}: {
  active: ActivityTab;
  onChange: (tab: ActivityTab) => void;
  aiPanelOpen: boolean;
  onToggleAI: () => void;
  gitChangesCount: number;
  engineeringOpen: boolean;
  onToggleEngineering: () => void;
}) {
  const { t } = useTranslation();
  const activePreview = usePreviewStore((s) => s.activePreview);
  const previewPanelOpen = usePreviewStore((s) => s.previewPanelOpen);
  const previewStatus = usePreviewStore((s) => s.previewStatus);

  const statusLabel = (title: string, status: PreviewStatus) => {
    if (status === "not-configured") return t("activity.status.notConfigured", { title });
    if (status === "running") return t("activity.status.running", { title });
    if (status === "starting") return t("activity.status.starting", { title });
    if (status === "failed") return t("activity.status.failed", { title });
    return title;
  };

  const badgeNotConfigured = (title: string) =>
    t("activity.badge.notConfigured", { title });

  const MAIN_ITEMS: { id: ActivityTab; title: string; icon: React.ReactNode }[] = [
    {
      id: "explorer",
      title: t("nav.explorerShortcut"),
      icon: <IconExplorer size={ACTIVITY_ICON} />,
    },
    {
      id: "search",
      title: t("nav.searchShortcut"),
      icon: <IconSearch size={ACTIVITY_ICON} />,
    },
    {
      id: "git",
      title: t("nav.sourceControlShortcut"),
      icon: (
        <div style={{ position: "relative" }}>
          <IconGit size={ACTIVITY_ICON} />
          {gitChangesCount > 0 && (
            <span
              aria-label={t("activity.badge.gitChanges", { count: gitChangesCount })}
              role="status"
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
      title: t("nav.marketplaceShortcut"),
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
        padding: "10px 0 8px",
        gap: 4,
        flexShrink: 0,
        zIndex: 20,
        height: "100%",
      }}
    >
      {MAIN_ITEMS.map((item) => (
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

      <ActivityBarSeparator />

      <ActivityBarItem
        title={t("nav.aiShortcut")}
        active={aiPanelOpen}
        statusDot={aiPanelOpen}
        onClick={onToggleAI}
        testId="activity-ai"
      >
        <span data-icon="ai">
          <IconSparkle size={ACTIVITY_ICON} />
        </span>
      </ActivityBarItem>

      <ActivityBarItem
        title={t("preview.webPreview")}
        active={previewPanelOpen && activePreview === "web"}
        status={previewStatus.web}
        statusLabel={statusLabel}
        badgeAriaLabel={badgeNotConfigured(t("preview.webPreview"))}
        onClick={() => togglePreviewFromRail("web")}
        testId="activity-preview-web"
      >
        <img src={webSidebarIcon} alt="" width={ACTIVITY_ICON} height={ACTIVITY_ICON} />
      </ActivityBarItem>

      <ActivityBarItem
        title={t("preview.mobilePreview")}
        active={previewPanelOpen && activePreview === "mobile"}
        status={previewStatus.mobile}
        statusLabel={statusLabel}
        badgeAriaLabel={badgeNotConfigured(t("preview.mobilePreview"))}
        onClick={() => togglePreviewFromRail("mobile")}
        testId="activity-preview-mobile"
      >
        <img src={mobileSidebarIcon} alt="" width={ACTIVITY_ICON} height={ACTIVITY_ICON} />
      </ActivityBarItem>

      <ActivityBarItem
        title={t("nav.engineeringShortcut")}
        active={engineeringOpen}
        onClick={onToggleEngineering}
        testId="activity-engineering"
      >
        <IconEngineering size={ACTIVITY_ICON} />
      </ActivityBarItem>

      <div className="activity-bar-spacer" style={{ flex: 1, minHeight: 8 }} />

      <ActivityBarSeparator />

      <ActivityBarItem
        title={t("nav.settingsShortcut")}
        active={isSettingsActive}
        onClick={() => onChange("settings")}
        testId="activity-settings"
      >
        <IconSettings size={ACTIVITY_ICON} />
      </ActivityBarItem>
    </div>
  );
}
