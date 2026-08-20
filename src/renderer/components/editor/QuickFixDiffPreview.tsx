import React, { useEffect, useRef } from "react";
import { useMonaco } from "@monaco-editor/react";
import type * as MonacoType from "monaco-editor";

import { acceptQuickFixPreview, rejectQuickFixPreview } from "../../ai/quick-fix-controller";
import { useQuickFixStore } from "../../store/quick-fix-store";
import { FeatureFirstUseTip } from "../ai/FeatureFirstUseTip";

export function QuickFixDiffPreview(): React.ReactElement | null {
  const session = useQuickFixStore((s) => s.session);
  const monaco = useMonaco();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const diffRef = useRef<MonacoType.editor.IStandaloneDiffEditor | null>(null);
  const originalModelRef = useRef<MonacoType.editor.ITextModel | null>(null);
  const modifiedModelRef = useRef<MonacoType.editor.ITextModel | null>(null);

  useEffect(() => {
    if (!session || session.phase !== "preview" || !monaco || !containerRef.current) {
      return;
    }

    const original = monaco.editor.createModel(session.originalText, "typescript");
    const modified = monaco.editor.createModel(session.modifiedText, "typescript");
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
  }, [session, monaco]);

  if (!session) return null;
  if (session.phase === "idle") return null;

  const busy = session.phase === "loading" || session.phase === "applying";

  return (
    <div
      role="dialog"
      aria-label="AI quick fix preview"
      data-testid="quick-fix-diff-preview"
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
          height: "min(640px, 88vh)",
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
            Fix with AI — diff preview
          </strong>
          <span style={{ color: "var(--caval-text-muted, #8b949e)", fontSize: 11 }}>
            {session.filePath}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button
              type="button"
              data-testid="quick-fix-reject"
              disabled={busy}
              onClick={() => rejectQuickFixPreview()}
              style={btnStyle(false)}
            >
              Reject
            </button>
            <button
              type="button"
              data-testid="quick-fix-accept"
              disabled={busy || session.phase !== "preview" || !monaco}
              onClick={() => {
                if (monaco) void acceptQuickFixPreview(monaco);
              }}
              style={btnStyle(true)}
            >
              {session.phase === "applying" ? "Applying…" : "Accept"}
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
            <FeatureFirstUseTip feature="quick-fix" active={session.phase === "preview"} />
          </div>
        )}

        {session.phase === "preview" && !session.explanation && (
          <div style={{ padding: "0 14px 8px" }}>
            <FeatureFirstUseTip feature="quick-fix" active />
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
              ? "Generating localized fix…"
              : session.error ?? "Quick fix failed"}
            {session.phase === "error" && (
              <button
                type="button"
                onClick={() => rejectQuickFixPreview()}
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
