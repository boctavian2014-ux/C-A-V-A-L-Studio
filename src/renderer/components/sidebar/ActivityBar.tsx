import React, { useSyncExternalStore } from "react";

import {
  IconExplorer,
  IconSearch,
  IconGit,
  IconMarketplace,
  IconSparkle,
  IconSettingsNeutral,
  IconEngineering,
  IconPreview,
} from "../brand/CavaloIcons";
import { usePreviewStore } from "../../store/preview-store";
import { useEditorStore } from "../../store/editor-store";
import type { PreviewStatus, PreviewTarget } from "../../../shared/preview-contract";
import { useTranslation } from "../../../../ai/i18n/useTranslation";

export type ActivityTab = "explorer" | "search" | "git" | "extensions" | "settings";
export type ArenaStatusIconState = "idle" | "open" | "active";
export type ArenaStatusMotionMode = "active" | "static";

export function arenaStatusMotionMode(
  state: ArenaStatusIconState,
  prefersReducedMotion: boolean
): ArenaStatusMotionMode {
  return state === "active" && !prefersReducedMotion ? "active" : "static";
}

function subscribePrefersReducedMotion(onStoreChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getPrefersReducedMotionSnapshot() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribePrefersReducedMotion,
    getPrefersReducedMotionSnapshot,
    () => false
  );
}

export const ACTIVITY_BAR_WIDTH = 48;
const ACTIVITY_BTN = 38;
const ACTIVITY_ICON = 24;
const GROUP_GAP = 8;
const SEPARATOR_MARGIN = 18;
const BADGE_SIZE = 7;

function getPreviewApi() {
  try {
    return window.caval?.preview ?? null;
  } catch {
    return null;
  }
}

export function mergePreviewRailStatus(
  web: PreviewStatus,
  mobile: PreviewStatus
): PreviewStatus {
  if (web === "running" || mobile === "running") return "running";
  if (web === "starting" || mobile === "starting") return "starting";
  if (web === "failed" || mobile === "failed") return "failed";
  if (web === "not-configured" || mobile === "not-configured") return "not-configured";
  return "stopped";
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
        background: "rgba(255,255,255,0.06)",
        margin: `${SEPARATOR_MARGIN}px 0`,
        flexShrink: 0,
      }}
    />
  );
}

function ActivityBarGroup({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: GROUP_GAP,
        width: "100%",
      }}
    >
      {children}
    </div>
  );
}

function TopRightBadge({
  color,
  ariaLabel,
  testId,
}: {
  color: string;
  ariaLabel?: string;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      aria-label={ariaLabel}
      role={ariaLabel ? "status" : undefined}
      style={{
        position: "absolute",
        top: 4,
        right: 4,
        width: BADGE_SIZE,
        height: BADGE_SIZE,
        borderRadius: "50%",
        background: color,
        boxShadow: "0 0 0 1px rgba(14,14,15,0.9)",
      }}
    />
  );
}

function ArenaStatusIcon({
  state,
  children,
}: {
  state: ArenaStatusIconState;
  children: React.ReactNode;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const motion = arenaStatusMotionMode(state, prefersReducedMotion);
  return (
    <span
      data-testid="arena-status-icon"
      data-state={state}
      data-motion={motion}
      data-reduced={prefersReducedMotion ? "true" : "false"}
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: ACTIVITY_ICON,
        height: ACTIVITY_ICON,
        lineHeight: 0,
        overflow: "hidden",
        flexShrink: 0,
        transition: "none",
      }}
    >
      <span
        data-testid="arena-status-icon-core"
        data-active={state === "active" ? "true" : "false"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: ACTIVITY_ICON,
          height: ACTIVITY_ICON,
          lineHeight: 0,
          transition: "none",
        }}
      >
        {children}
      </span>
    </span>
  );
}

function ActivityBarItem({
  title,
  active,
  onClick,
  children,
  status,
  testId,
  statusLabel,
  badgeAriaLabel,
  variant = "default",
  showBadge,
  badgeColor,
}: {
  title: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  status?: PreviewStatus;
  testId?: string;
  statusLabel?: (title: string, status: PreviewStatus) => string;
  badgeAriaLabel?: string;
  variant?: "default" | "neutral";
  showBadge?: boolean;
  badgeColor?: string;
}) {
  const { t } = useTranslation();
  const accentActive = variant === "default";
  const tooltip =
    status && statusLabel
      ? statusLabel(title, status)
      : status === "not-configured"
        ? t("activity.status.notConfigured", { title })
        : status === "running"
          ? t("activity.status.running", { title })
          : status === "starting"
            ? t("activity.status.starting", { title })
            : status === "failed"
              ? t("activity.status.failed", { title })
              : title;

  const activeBg = accentActive ? "rgba(0,224,255,0.08)" : "rgba(255,255,255,0.1)";
  const activeColor = accentActive ? "var(--caval-accent)" : "var(--caval-text)";
  const stripeColor = accentActive ? "var(--caval-accent)" : "rgba(255,255,255,0.45)";

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
        background: active ? activeBg : "transparent",
        color: active ? activeColor : "var(--caval-text-muted)",
        transition: "background 0.15s, color 0.15s",
        position: "relative",
        flexShrink: 0,
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
            background: stripeColor,
            boxShadow: accentActive ? "0 0 6px rgba(0,224,255,0.35)" : undefined,
          }}
        />
      )}
      {status === "not-configured" && (
        <TopRightBadge
          color="#E2C08D"
          testId={`${testId}-badge-muted`}
          ariaLabel={badgeAriaLabel}
        />
      )}
      {status === "running" && (
        <TopRightBadge color="#22C55E" testId={`${testId}-badge-live`} />
      )}
      {showBadge && badgeColor ? (
        <TopRightBadge color={badgeColor} ariaLabel={badgeAriaLabel} testId={`${testId}-badge`} />
      ) : null}
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
  arenaStatus = "idle",
}: {
  active: ActivityTab;
  onChange: (tab: ActivityTab) => void;
  aiPanelOpen: boolean;
  onToggleAI: () => void;
  gitChangesCount: number;
  engineeringOpen: boolean;
  onToggleEngineering: () => void;
  arenaStatus?: ArenaStatusIconState;
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

  const mergedPreviewStatus = mergePreviewRailStatus(
    previewStatus.web,
    previewStatus.mobile
  );

  const previewTarget: PreviewTarget = activePreview ?? "web";
  const gitTitle =
    gitChangesCount > 0
      ? `${t("nav.sourceControlShortcut")} · ${t("activity.badge.gitChanges", { count: gitChangesCount })}`
      : t("nav.sourceControlShortcut");

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
      title: gitTitle,
      icon: <IconGit size={ACTIVITY_ICON} />,
    },
    {
      id: "extensions",
      title: t("nav.marketplaceShortcut"),
      icon: <IconMarketplace size={ACTIVITY_ICON} />,
    },
  ];

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
        flexShrink: 0,
        zIndex: 20,
        height: "100%",
      }}
    >
      <ActivityBarGroup>
        {MAIN_ITEMS.map((item) => (
          <ActivityBarItem
            key={item.id}
            title={item.title}
            active={active === item.id}
            onClick={() => onChange(item.id)}
            testId={`activity-${item.id}`}
            showBadge={item.id === "git" && gitChangesCount > 0}
            badgeColor="#E2C08D"
            badgeAriaLabel={
              item.id === "git" && gitChangesCount > 0
                ? t("activity.badge.gitChanges", { count: gitChangesCount })
                : undefined
            }
          >
            {item.icon}
          </ActivityBarItem>
        ))}
      </ActivityBarGroup>

      <ActivityBarSeparator />

      <ActivityBarGroup>
        <ActivityBarItem
          title={t("nav.codingArenaShortcut")}
          active={aiPanelOpen}
          onClick={onToggleAI}
          testId="activity-ai"
        >
          <ArenaStatusIcon state={arenaStatus === "active" ? "active" : aiPanelOpen ? "open" : "idle"}>
            <IconSparkle size={ACTIVITY_ICON} />
          </ArenaStatusIcon>
        </ActivityBarItem>

        <ActivityBarItem
          title={t("nav.preview")}
          active={previewPanelOpen}
          status={mergedPreviewStatus}
          statusLabel={statusLabel}
          badgeAriaLabel={t("activity.badge.notConfigured", { title: t("nav.preview") })}
          onClick={() => togglePreviewFromRail(previewTarget)}
          testId="activity-preview"
        >
          <IconPreview size={ACTIVITY_ICON} />
        </ActivityBarItem>

        <ActivityBarItem
          title={t("nav.engineeringShortcut")}
          active={engineeringOpen}
          onClick={onToggleEngineering}
          testId="activity-engineering"
        >
          <IconEngineering size={ACTIVITY_ICON} />
        </ActivityBarItem>
      </ActivityBarGroup>

      <div className="activity-bar-spacer" style={{ flex: 1, minHeight: 8 }} />

      <ActivityBarSeparator />

      <ActivityBarItem
        title={t("nav.settingsShortcut")}
        active={active === "settings"}
        variant="neutral"
        onClick={() => onChange("settings")}
        testId="activity-settings"
      >
        <IconSettingsNeutral size={ACTIVITY_ICON} />
      </ActivityBarItem>
    </div>
  );
}
