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

export function WrittenFilesCard({
  files,
  proposedWrites,
  messageId,
}: {
  files?: string[];
  proposedWrites?: ProposedWrite[];
  messageId?: string;
}) {
  const projectPath = useEditorStore((s) => s.projectPath);
  const openFile = useEditorStore((s) => s.openFile);
  const monaco = useMonaco();
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [appliedNew, setAppliedNew] = useState<ProposedWrite[] | null>(null);

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
    void window.caval?.preview?.start(target);
  };

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
  if (!list.length) return null;

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
      <div style={{ fontWeight: 600 }}>{formatWrittenFilesHeadline(list.length)}</div>
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
        {list.map((file) => (
          <li key={file}>
            <button
              type="button"
              data-testid="written-file-open"
              title={`Deschide ${file}`}
              onClick={() => openRel(file)}
              style={{
                display: "block",
                width: "100%",
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
              {file}
            </button>
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
        Apasă un fișier ca să-l deschizi. Preview e și în Explorer, sub proiect.
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
