import React, { useEffect, useState } from "react";
import { useMonaco } from "@monaco-editor/react";

import type { ProposedWrite } from "../../src/shared/ai-chat-apply-contract";
import { formatProposedWritesHeadline } from "../../src/shared/ai-chat-apply-contract";
import { dispatchOpenExplorerSidebar } from "../../src/renderer/components/engineering/bootstrap-robotics-project";
import { useEditorStore } from "../../src/renderer/store/editor-store";
import {
  acceptProposedWritesForMessage,
  previewTextsForWrite,
  rejectProposedWritesForMessage,
  revertAppliedNewWrites,
} from "./chat-apply-controller";
import { formatWrittenFilesHeadline, joinWorkspaceRelativePath } from "./written-files";
import { useAiHistoryStore } from "../../src/renderer/store/ai-history-store";
import { usePreviewStore } from "../../src/renderer/store/preview-store";
import { useLiveAiEdits } from "./use-live-ai-edits";
import type { LiveAiEdit, LiveAiEditStatus } from "./live-ai-edits-store";

function fileExtIcon(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "tsx" || ext === "ts") return "TS";
  if (ext === "jsx" || ext === "js") return "JS";
  if (ext === "json") return "{}";
  if (ext === "css" || ext === "scss") return "#";
  if (ext === "html") return "<>";
  if (ext === "md") return "MD";
  return "·";
}

function statusLabel(status: LiveAiEditStatus): string {
  if (status === "writing") return "writing";
  if (status === "error") return "error";
  return "done";
}

function statusColor(status: LiveAiEditStatus): string {
  if (status === "writing") return "#00E0FF";
  if (status === "error") return "#EF4444";
  return "#2FBF71";
}

/** Compact live file timeline under chat (Cursor-style). */
export function LiveAiFilesStrip({
  edits,
  onOpen,
}: {
  edits: LiveAiEdit[];
  onOpen: (rel: string) => void;
}) {
  if (!edits.length) return null;
  return (
    <div
      role="region"
      aria-label="AI files live"
      data-testid="live-ai-files-strip"
      style={{
        marginTop: 10,
        padding: "8px 12px",
        borderRadius: 6,
        background: "rgba(0,224,255,0.05)",
        border: "1px solid rgba(0,224,255,0.22)",
        fontSize: 11.5,
      }}
    >
      <div style={{ fontWeight: 600, color: "var(--caval-accent)", marginBottom: 6 }}>
        {edits.filter((e) => e.status === "writing").length
          ? `AI scrie ${edits.filter((e) => e.status === "writing").length} fișier(e)…`
          : `${edits.length} fișier(e) afectate`}
      </div>
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          maxHeight: 120,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {edits.map((e) => (
          <li key={e.path}>
            <button
              type="button"
              data-testid="live-ai-file-open"
              data-status={e.status}
              title={`Deschide ${e.path}`}
              onClick={() => onOpen(e.path)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                textAlign: "left",
                background: "none",
                border: "none",
                padding: "3px 0",
                color: "var(--caval-text)",
                fontSize: 11.5,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 14,
                  borderRadius: 3,
                  fontSize: 8,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(255,255,255,0.06)",
                  color: "var(--caval-text-muted)",
                  flexShrink: 0,
                }}
              >
                {fileExtIcon(e.path)}
              </span>
              <span style={{ flex: 1, wordBreak: "break-all" }}>{e.path}</span>
              <span style={{ color: statusColor(e.status), fontSize: 10, flexShrink: 0 }}>
                {e.status === "writing" ? (
                  <span className="caval-ai-tab-spinner" style={{ display: "inline-block" }} />
                ) : (
                  statusLabel(e.status)
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WrittenFilesCard({
  files,
  proposedWrites,
  messageId,
  historicalWrittenFiles,
  showLive = false,
}: {
  files?: string[];
  proposedWrites?: ProposedWrite[];
  messageId?: string;
  historicalWrittenFiles?: Array<{ id: string; filePath: string }>;
  /** When true (streaming message), also show live AI edit strip. */
  showLive?: boolean;
}) {
  const projectPath = useEditorStore((s) => s.projectPath);
  const openFile = useEditorStore((s) => s.openFile);
  const revertWrittenFile = useAiHistoryStore((s) => s.revertWrittenFile);
  const monaco = useMonaco();
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [appliedNew, setAppliedNew] = useState<ProposedWrite[] | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const liveEdits = useLiveAiEdits();

  useEffect(() => {
    if (showLive) {
      void import("./live-ai-edit-styles.js").then((m) => m.ensureLiveAiEditStyles());
    }
  }, [showLive]);

  const proposed = proposedWrites ?? [];
  const isProposed = proposed.length > 0;

  useEffect(() => {
    if (window.caval?.fs) {
      void useEditorStore.getState().refreshTree();
    }
  }, []);

  useEffect(() => {
    if (!previewPath || !monaco || !isProposed) return;
    const write = proposed.find((w) => w.path === previewPath);
    if (!write) return;
    const host = document.getElementById("caval-chat-apply-diff");
    if (!host) return;
    const { original, modified } = previewTextsForWrite(write);
    const originalModel = monaco.editor.createModel(original, "typescript");
    const modifiedModel = monaco.editor.createModel(modified, "typescript");
    const diff = monaco.editor.createDiffEditor(host, {
      readOnly: true,
      renderSideBySide: true,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 11,
    });
    diff.setModel({ original: originalModel, modified: modifiedModel });
    return () => {
      diff.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
    };
  }, [previewPath, monaco, isProposed, proposed]);

  const openRel = (rel: string) => {
    if (!projectPath) return;
    void openFile(joinWorkspaceRelativePath(projectPath, rel));
  };

  const startPreview = (target: "web" | "mobile") => {
    dispatchOpenExplorerSidebar();
    usePreviewStore.getState().activatePreview(target, null);
    void window.caval?.preview?.start(target);
  };

  if (showLive && liveEdits.length > 0 && !isProposed) {
    return <LiveAiFilesStrip edits={liveEdits} onOpen={openRel} />;
  }

  if (isProposed && messageId) {
    return (
      <div
        role="region"
        aria-label="Proposed file changes"
        data-testid="proposed-writes-card"
        style={{
          marginTop: 10,
          padding: "8px 12px",
          borderRadius: 6,
          background: "rgba(0,224,255,0.06)",
          border: "1px solid rgba(0,224,255,0.28)",
          fontSize: 11.5,
          color: "var(--caval-accent)",
        }}
      >
        <div style={{ fontWeight: 600 }}>{formatProposedWritesHeadline(proposed.length)}</div>
        <ul
          style={{
            margin: "8px 0 0",
            padding: 0,
            listStyle: "none",
            maxHeight: 140,
            overflowY: "auto",
          }}
        >
          {proposed.map((w) => (
            <li key={w.path}>
              <button
                type="button"
                data-testid="proposed-write-preview"
                onClick={() => setPreviewPath(w.path)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: previewPath === w.path ? "rgba(0,224,255,0.12)" : "none",
                  border: "none",
                  padding: "3px 0",
                  color: "var(--caval-text)",
                  fontSize: 11.5,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  cursor: "pointer",
                  wordBreak: "break-all",
                }}
              >
                {w.path}
                {w.isNew ? " (new)" : ""}
              </button>
            </li>
          ))}
        </ul>
        {previewPath && (
          <div
            id="caval-chat-apply-diff"
            data-testid="proposed-write-diff"
            style={{ height: 180, marginTop: 8, border: "1px solid var(--caval-border)" }}
          />
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          <button
            type="button"
            data-testid="proposed-writes-accept"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              const news = proposed.filter((w) => w.isNew);
              void acceptProposedWritesForMessage(messageId)
                .then(() => setAppliedNew(news.length ? news : null))
                .finally(() => setBusy(false));
            }}
            style={btn(true)}
          >
            {busy ? "Applying…" : "Accept"}
          </button>
          <button
            type="button"
            data-testid="proposed-writes-reject"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void rejectProposedWritesForMessage(messageId).finally(() => setBusy(false));
            }}
            style={btn(false)}
          >
            Reject
          </button>
          {appliedNew && appliedNew.length > 0 && (
            <button
              type="button"
              data-testid="proposed-writes-revert"
              onClick={() => {
                void revertAppliedNewWrites(appliedNew).then(() => setAppliedNew(null));
              }}
              style={btn(false)}
              title="Deletes newly created files (documented limitation — not Monaco undo)"
            >
              Revert new files
            </button>
          )}
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--caval-text-muted)" }}>
          Nicio scriere până la Accept. Fișiere deschise: Ctrl+Z nativ. Fișiere noi: Revert șterge
          fișierul.
        </p>
      </div>
    );
  }

  const list = files ?? [];
  const historical = historicalWrittenFiles ?? [];
  if (!list.length && !historical.length) {
    if (showLive && liveEdits.length > 0) {
      return <LiveAiFilesStrip edits={liveEdits} onOpen={openRel} />;
    }
    return null;
  }

  const rows =
    historical.length > 0
      ? historical
      : list.map((filePath) => ({ id: "", filePath }));

  return (
    <div
      role="region"
      aria-label="Fișiere create"
      data-testid="written-files-card"
      style={{
        marginTop: 10,
        padding: "8px 12px",
        borderRadius: 6,
        background: "rgba(47,191,113,0.08)",
        border: "1px solid rgba(47,191,113,0.25)",
        fontSize: 11.5,
        color: "var(--caval-success)",
      }}
    >
      <div style={{ fontWeight: 600 }}>{formatWrittenFilesHeadline(rows.length)}</div>
      <ul
        style={{
          margin: "8px 0 0",
          padding: 0,
          listStyle: "none",
          maxHeight: 180,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {rows.map((row) => (
          <li
            key={row.id || row.filePath}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <button
              type="button"
              data-testid="written-file-open"
              title={`Deschide ${row.filePath}`}
              onClick={() => openRel(row.filePath)}
              style={{
                display: "block",
                flex: 1,
                textAlign: "left",
                background: "none",
                border: "none",
                padding: "3px 0",
                color: "var(--caval-text)",
                fontSize: 11.5,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                cursor: projectPath ? "pointer" : "default",
                wordBreak: "break-all",
              }}
            >
              {row.filePath}
            </button>
            {row.id ? (
              <button
                type="button"
                data-testid="written-file-revert-history"
                disabled={revertingId === row.id}
                onClick={() => {
                  setRevertingId(row.id);
                  void revertWrittenFile(row.id).finally(() => setRevertingId(null));
                }}
                style={{
                  flexShrink: 0,
                  height: 22,
                  padding: "0 8px",
                  borderRadius: 4,
                  border: "1px solid var(--caval-border)",
                  background: "transparent",
                  color: "var(--caval-text-muted)",
                  fontSize: 10,
                  cursor: "pointer",
                }}
                title="Restore accepted snapshot"
              >
                {revertingId === row.id ? "…" : "Revert"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          className="preview-open-btn"
          data-testid="written-files-open-web"
          onClick={() => startPreview("web")}
        >
          Open Web
        </button>
        <button
          type="button"
          className="preview-open-btn"
          data-testid="written-files-open-mobile"
          onClick={() => startPreview("mobile")}
        >
          Open Mobile
        </button>
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--caval-text-muted)" }}>
        {historical.length
          ? "Revert restores the accepted snapshot from history."
          : "Apasă un fișier ca să-l deschizi. Preview e și în Explorer, sub proiect."}
      </p>
    </div>
  );
}

function btn(primary: boolean): React.CSSProperties {
  return {
    height: 26,
    padding: "0 10px",
    borderRadius: 5,
    border: primary ? "1px solid rgba(0,224,255,0.45)" : "1px solid var(--caval-border)",
    background: primary ? "rgba(0,224,255,0.14)" : "transparent",
    color: primary ? "var(--caval-accent)" : "var(--caval-text-muted)",
    cursor: "pointer",
    fontSize: 11,
  };
}
