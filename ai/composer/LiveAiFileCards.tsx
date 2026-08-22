import React, { useEffect, useMemo, useRef, useState } from "react";

import { useTranslation } from "../i18n/useTranslation";
import type { LiveAiEdit, LiveAiEditStatus } from "./live-ai-edits-store";
import { tabPathMatchesLiveEdit } from "./live-ai-edits-store";
import { ensureLiveAiEditStyles } from "./live-ai-edit-styles";

const STREAM_VISIBLE = 5;
const COMPLETED_VISIBLE = 3;

const STATUS_RANK: Record<LiveAiEditStatus, number> = {
  writing: 0,
  waiting: 1,
  error: 2,
  done: 3,
};

export function fileExtIcon(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "tsx" || ext === "ts") return "TS";
  if (ext === "jsx" || ext === "js") return "JS";
  if (ext === "json") return "{}";
  if (ext === "css" || ext === "scss") return "#";
  if (ext === "html") return "<>";
  if (ext === "md") return "MD";
  return "·";
}

export function shortRelativePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (parts.length <= 2) return normalized;
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

export function sortEditsForDisplay(edits: LiveAiEdit[]): LiveAiEdit[] {
  return [...edits].sort((a, b) => {
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rank !== 0) return rank;
    return a.updatedAt - b.updatedAt;
  });
}

export function writtenFilesToEdits(paths: string[]): LiveAiEdit[] {
  const now = Date.now();
  return paths.map((path, index) => ({
    path,
    status: "done" as const,
    updatedAt: now + index,
  }));
}

function statusLabel(status: LiveAiEditStatus, t: (key: string) => string): string {
  if (status === "waiting") return t("ai.files.waiting");
  if (status === "writing") return t("ai.files.writing");
  if (status === "error") return t("ai.files.failed");
  return t("ai.files.done");
}

function StatusIcon({ status }: { status: LiveAiEditStatus }) {
  if (status === "writing") {
    return <span className="caval-ai-tab-spinner" aria-hidden="true" />;
  }
  if (status === "waiting") {
    return (
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          border: "1.5px solid var(--caval-text-muted)",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
    );
  }
  if (status === "error") {
    return (
      <span aria-hidden="true" style={{ color: "#EF4444", fontSize: 12, flexShrink: 0 }}>
        ✕
      </span>
    );
  }
  return (
    <span aria-hidden="true" style={{ color: "#2FBF71", fontSize: 12, flexShrink: 0 }}>
      ✓
    </span>
  );
}

export interface LiveAiFileCardsProps {
  edits: LiveAiEdit[];
  mode: "streaming" | "completed";
  isStreaming?: boolean;
  onOpen: (rel: string) => void;
  activeEditorPath?: string | null;
  projectPath?: string | null;
  /** Optional preview actions for completed mode */
  onOpenWebPreview?: () => void;
  onOpenMobilePreview?: () => void;
}

export function LiveAiFileCards({
  edits,
  mode,
  isStreaming = false,
  onOpen,
  activeEditorPath,
  projectPath,
  onOpenWebPreview,
  onOpenMobilePreview,
}: LiveAiFileCardsProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const liveSummaryRef = useRef<HTMLDivElement>(null);
  const prevSummaryRef = useRef("");

  useEffect(() => {
    if (edits.length > 0) ensureLiveAiEditStyles();
  }, [edits.length]);

  useEffect(() => {
    if (isStreaming) setExpanded(false);
  }, [isStreaming]);

  const sorted = useMemo(() => sortEditsForDisplay(edits), [edits]);
  if (!sorted.length) return null;

  const limit = mode === "streaming" ? STREAM_VISIBLE : COMPLETED_VISIBLE;
  const hasMore = sorted.length > limit;
  const visible = expanded || !hasMore ? sorted : sorted.slice(0, limit);
  const hiddenCount = sorted.length - limit;

  const inProgress = sorted.some((e) => e.status === "writing" || e.status === "waiting");
  const title =
    mode === "streaming" || inProgress
      ? t("ai.files.building")
      : t("ai.files.createdCount", { count: sorted.length });

  const writingCount = sorted.filter((e) => e.status === "writing").length;
  const doneCount = sorted.filter((e) => e.status === "done").length;
  const summaryText =
    mode === "streaming" && inProgress
      ? t("ai.files.writingCount", { count: writingCount || sorted.length })
      : t("ai.files.createdCount", { count: doneCount || sorted.length });

  useEffect(() => {
    if (!liveSummaryRef.current || summaryText === prevSummaryRef.current) return;
    prevSummaryRef.current = summaryText;
    liveSummaryRef.current.textContent = summaryText;
  }, [summaryText]);

  const toggleLabel =
    mode === "streaming"
      ? expanded
        ? t("ai.files.showLess")
        : t("ai.files.showMore", { count: hiddenCount })
      : expanded
        ? t("ai.files.showLess")
        : t("ai.files.viewAll", { count: sorted.length });

  return (
    <div
      role="region"
      aria-label={t("ai.files.liveAria")}
      data-testid="live-ai-file-cards"
      data-mode={mode}
      style={{ marginTop: mode === "streaming" ? 0 : 10 }}
    >
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          color: inProgress ? "var(--caval-accent)" : "var(--caval-success)",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div
        ref={liveSummaryRef}
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      />
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {visible.map((edit) => {
          const isActive =
            Boolean(activeEditorPath) &&
            tabPathMatchesLiveEdit(activeEditorPath!, edit.path, projectPath);
          const isWriting = edit.status === "writing";
          return (
            <li key={edit.path}>
              <button
                type="button"
                data-testid="live-ai-file-card"
                data-status={edit.status}
                data-path={edit.path}
                aria-label={`${t("ai.files.openPath", { path: edit.path })} — ${statusLabel(edit.status, t)}`}
                onClick={() => onOpen(edit.path)}
                className={[
                  "caval-ai-file-card",
                  isActive ? "caval-ai-file-card--active" : "",
                  isWriting ? "caval-ai-file-card--writing" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="caval-ai-file-card-icon">{fileExtIcon(edit.path)}</span>
                <span className="caval-ai-file-card-path" title={edit.path}>
                  {shortRelativePath(edit.path)}
                </span>
                <span className="caval-ai-file-card-status">
                  <StatusIcon status={edit.status} />
                  <span
                    style={{
                      color:
                        edit.status === "writing"
                          ? "#00E0FF"
                          : edit.status === "error"
                            ? "#EF4444"
                            : edit.status === "waiting"
                              ? "var(--caval-text-muted)"
                              : "#2FBF71",
                    }}
                  >
                    {statusLabel(edit.status, t)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {hasMore ? (
        <button
          type="button"
          data-testid="live-ai-file-cards-toggle"
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: 8,
            padding: 0,
            border: "none",
            background: "none",
            color: "var(--caval-text-muted)",
            fontSize: 11,
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          {toggleLabel}
        </button>
      ) : null}
      {mode === "completed" && (onOpenWebPreview || onOpenMobilePreview) ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {onOpenWebPreview ? (
            <button
              type="button"
              className="preview-open-btn"
              data-testid="written-files-open-web"
              onClick={onOpenWebPreview}
            >
              {t("ai.files.openWeb")}
            </button>
          ) : null}
          {onOpenMobilePreview ? (
            <button
              type="button"
              className="preview-open-btn"
              data-testid="written-files-open-mobile"
              onClick={onOpenMobilePreview}
            >
              {t("ai.files.openMobile")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
