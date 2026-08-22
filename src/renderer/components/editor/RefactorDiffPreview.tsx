import React, { useEffect, useRef } from "react";
import { useMonaco } from "@monaco-editor/react";
import type * as MonacoType from "monaco-editor";

import {
  acceptRefactorPreview,
  rejectRefactorPreview,
  revertLastRefactorApply,
} from "../../ai/refactor-controller";
import { useRefactorStore } from "../../store/refactor-store";
import { FeatureFirstUseTip } from "../ai/FeatureFirstUseTip";
import { useTranslation } from "../../../../ai/i18n/useTranslation";

export function RefactorDiffPreview(): React.ReactElement | null {
  const { t } = useTranslation();
  const session = useRefactorStore((s) => s.session);
  const lastApplied = useRefactorStore((s) => s.lastApplied);
  const setActivePath = useRefactorStore((s) => s.setActivePath);
  const monaco = useMonaco();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const diffRef = useRef<MonacoType.editor.IStandaloneDiffEditor | null>(null);
  const originalModelRef = useRef<MonacoType.editor.ITextModel | null>(null);
  const modifiedModelRef = useRef<MonacoType.editor.ITextModel | null>(null);

  const active =
    session?.files.find((f) => f.filePath === session.activePath) ??
    session?.files[0];

  useEffect(() => {
    if (!session || session.phase !== "preview" || !monaco || !containerRef.current || !active) {
      return;
    }

    originalModelRef.current?.dispose();
    modifiedModelRef.current?.dispose();
    if (diffRef.current) {
      diffRef.current.dispose();
      diffRef.current = null;
    }

    const original = monaco.editor.createModel(active.originalText, "typescript");
    const modified = monaco.editor.createModel(active.modifiedText, "typescript");
    originalModelRef.current = original;
    modifiedModelRef.current = modified;

    const diff = monaco.editor.createDiffEditor(containerRef.current, {
      readOnly: true,
      renderSideBySide: true,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontFamily: "JetBrains Mono, Consolas, monospace",
      fontSize: 12,
      theme: "caval-dark",
    });
    diff.setModel({ original, modified });
    diffRef.current = diff;

    return () => {
      diff.dispose();
      original.dispose();
      modified.dispose();
      diffRef.current = null;
      originalModelRef.current = null;
      modifiedModelRef.current = null;
    };
  }, [session?.phase, session?.activePath, active?.filePath, monaco]);

  if (!session && !lastApplied?.length) return null;
  if (session?.phase === "idle") return null;

  if (!session && lastApplied?.length) {
    return (
      <div
        role="status"
        data-testid="refactor-revert-bar"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 1200,
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "10px 14px",
          background: "#0D1117",
          border: "1px solid var(--caval-border, #30363d)",
          borderRadius: 8,
          boxShadow: "0 8px 28px rgba(0,0,0,0.4)",
        }}
      >
        <span style={{ color: "var(--caval-text-muted, #8b949e)", fontSize: 12 }}>
          Refactor applied ({lastApplied.length} file
          {lastApplied.length === 1 ? "" : "s"})
        </span>
        <button
          type="button"
          data-testid="refactor-revert"
          onClick={() => void revertLastRefactorApply()}
          style={btnStyle(false)}
        >
          Revert new/deleted
        </button>
        <button
          type="button"
          onClick={() => useRefactorStore.getState().setLastApplied(null)}
          style={btnStyle(false)}
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (!session) return null;

  const busy = session.phase === "loading" || session.phase === "applying";

  return (
    <div
      role="dialog"
      aria-label={t("editor.refactorAria")}
      data-testid="refactor-diff-preview"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(1100px, 96vw)",
          height: "min(680px, 90vh)",
          background: "#0D1117",
          border: "1px solid var(--caval-border, #30363d)",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderBottom: "1px solid var(--caval-border, #30363d)",
            flexShrink: 0,
          }}
        >
          <strong style={{ color: "var(--caval-text, #e6edf3)", fontSize: 13 }}>
            {t("editor.refactorTitle")}
          </strong>
          <span style={{ color: "var(--caval-text-muted, #8b949e)", fontSize: 11 }}>
            {session.kind} · {session.files.length} file
            {session.files.length === 1 ? "" : "s"}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button
              type="button"
              data-testid="refactor-reject"
              disabled={busy}
              onClick={() => rejectRefactorPreview()}
              style={btnStyle(false)}
            >
              {t("editor.rejectAll")}
            </button>
            <button
              type="button"
              data-testid="refactor-accept"
              disabled={busy || session.phase !== "preview" || !monaco}
              onClick={() => {
                if (monaco) void acceptRefactorPreview(monaco);
              }}
              style={btnStyle(true)}
            >
              {session.phase === "applying" ? t("editor.applying") : t("editor.acceptAll")}
            </button>
          </div>
        </div>

        {session.explanation && session.phase === "preview" && (
          <div
            style={{
              padding: "8px 14px",
              color: "var(--caval-text-muted, #8b949e)",
              fontSize: 12,
              borderBottom: "1px solid var(--caval-border, #30363d)",
            }}
          >
            {session.explanation}
            <FeatureFirstUseTip feature="refactor" active />
          </div>
        )}

        {session.phase === "preview" && !session.explanation && (
          <div style={{ padding: "0 14px 8px" }}>
            <FeatureFirstUseTip feature="refactor" active />
          </div>
        )}

        {session.phase === "preview" && session.files.length > 0 && (
          <div
            role="tablist"
            style={{
              display: "flex",
              gap: 4,
              padding: "6px 10px",
              borderBottom: "1px solid var(--caval-border, #30363d)",
              overflowX: "auto",
              flexShrink: 0,
            }}
          >
            {session.files.map((f) => {
              const selected = f.filePath === (session.activePath ?? session.files[0]?.filePath);
              const badge = f.edit.isNew ? " (new)" : f.edit.isDeleted ? " (deleted)" : "";
              return (
                <button
                  key={f.filePath}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  data-testid={`refactor-tab-${f.filePath}`}
                  onClick={() => setActivePath(f.filePath)}
                  style={{
                    ...btnStyle(selected),
                    height: 26,
                    whiteSpace: "nowrap",
                    fontSize: 11,
                  }}
                >
                  {f.filePath}
                  {badge}
                </button>
              );
            })}
          </div>
        )}

        {(session.phase === "loading" || session.phase === "error") && (
          <div
            role={session.phase === "error" ? "alert" : "status"}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: session.phase === "error" ? "#EF4444" : "var(--caval-text-muted, #8b949e)",
              fontSize: 13,
              padding: 24,
              textAlign: "center",
            }}
          >
            {session.phase === "loading"
              ? "Generating multi-file refactor…"
              : session.error ?? "Refactor failed"}
            {session.phase === "error" && (
              <button
                type="button"
                onClick={() => rejectRefactorPreview()}
                style={{ ...btnStyle(false), marginLeft: 12 }}
              >
                Close
              </button>
            )}
          </div>
        )}

        {session.phase === "preview" || session.phase === "applying" ? (
          <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
        ) : null}
      </div>
    </div>
  );
}

function btnStyle(primary: boolean): React.CSSProperties {
  return {
    height: 28,
    padding: "0 12px",
    borderRadius: 6,
    border: primary ? "1px solid rgba(0,224,255,0.45)" : "1px solid var(--caval-border, #30363d)",
    background: primary ? "rgba(0,224,255,0.14)" : "transparent",
    color: primary ? "var(--caval-accent, #00E0FF)" : "var(--caval-text-muted, #8b949e)",
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "inherit",
  };
}
