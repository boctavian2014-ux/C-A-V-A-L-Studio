import React, { useEffect, useState } from "react";
import { useMonaco } from "@monaco-editor/react";

import type { ProposedWrite } from "../../src/shared/ai-chat-apply-contract";
import { formatProposedWritesHeadline } from "../../src/shared/ai-chat-apply-contract";
import { useEditorStore } from "../../src/renderer/store/editor-store";
import {
  acceptProposedWritesForMessage,
  previewTextsForWrite,
  rejectProposedWritesForMessage,
  revertAppliedNewWrites,
} from "./chat-apply-controller";
import { useTranslation } from "../i18n/useTranslation";

/** Proposed writes only — Accept/Reject/diff preview. Completed file lists use LiveAiFileCards. */
export function WrittenFilesCard({
  proposedWrites,
  messageId,
}: {
  proposedWrites?: ProposedWrite[];
  messageId?: string;
}) {
  const { t } = useTranslation();
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

  if (!isProposed || !messageId) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label={t("ai.files.proposedAria")}
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
            {t("ai.files.revertNew")}
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
