import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAIStore } from "./ai-store";
import { useEditorStore } from "../../src/renderer/store/editor-store";
import { ChatModeSelect } from "./ChatModeSelect";
import { AI_ONBOARDING_SUGGESTIONS } from "./AIOnboarding";
import { AiToolsInfoContent } from "./AiToolsInfoContent";
import { useTranslation } from "../i18n/useTranslation";
import { startExplainForSelection } from "../../src/renderer/ai/explain-controller";

function ToolbarIconBtn({
  title,
  onClick,
  active,
  disabled,
  children,
  testId,
}: {
  title: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 24,
        height: 24,
        borderRadius: 4,
        border: `1px solid ${active ? "var(--caval-accent)" : "transparent"}`,
        background: active ? "var(--caval-accent-glow)" : "none",
        color: active ? "var(--caval-accent)" : "var(--caval-text-muted)",
        cursor: disabled ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        opacity: disabled ? 0.45 : 1,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

export function AiPanelToolbar({
  isStreaming,
  onStartChat,
}: {
  isStreaming: boolean;
  onStartChat: (prompt: string) => void;
}) {
  const { t } = useTranslation();
  const {
    ideContextMode,
    setIdeContextMode,
    includeMode,
    setIncludeMode,
    verifyInFlight,
    runWorkspaceVerifyAndReport,
    runBuildAndReport,
  } = useAIStore();
  const projectPath = useEditorStore((s) => s.projectPath);
  const editorSelection = useEditorStore((s) => s.editorSelection);

  const [quickOpen, setQuickOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [actionHint, setActionHint] = useState<string | null>(null);
  const quickRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);

  const closeMenus = useCallback(() => {
    setQuickOpen(false);
    setToolsOpen(false);
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (quickOpen && quickRef.current && !quickRef.current.contains(target)) {
        setQuickOpen(false);
      }
      if (toolsOpen && toolsRef.current && !toolsRef.current.contains(target)) {
        setToolsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [quickOpen, toolsOpen]);

  const handleQuickAction = (id: string) => {
    const suggestion = AI_ONBOARDING_SUGGESTIONS.find((s) => s.id === id);
    if (!suggestion) return;
    setQuickOpen(false);
    if (id === "explain") {
      setActionHint(null);
      void startExplainForSelection();
      return;
    }
    if (suggestion.prompt) {
      setActionHint(null);
      onStartChat(suggestion.prompt);
      return;
    }
    setActionHint(suggestion.hint ?? t("ai.toolbar.quickActions"));
  };

  const verifyDisabled = verifyInFlight !== "none" || !projectPath || isStreaming;

  return (
    <div
      data-testid="ai-panel-toolbar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        flexWrap: "wrap",
        justifyContent: "flex-end",
      }}
    >
      <ChatModeSelect variant="compact" />

      <ToolbarIconBtn
        testId="ai-toolbar-ide-context"
        title={t("ai.toolbar.ideContext")}
        active={ideContextMode !== "disabled"}
        onClick={() => setIdeContextMode(ideContextMode === "disabled" ? "enabled" : "disabled")}
      >
        ◉
      </ToolbarIconBtn>

      {editorSelection?.text ? (
        <ToolbarIconBtn
          testId="ai-toolbar-selection"
          title={t("ai.toolbar.selectionContext")}
          active={includeMode === "selection"}
          onClick={() => setIncludeMode(includeMode === "selection" ? "project" : "selection")}
        >
          Sel
        </ToolbarIconBtn>
      ) : null}

      <ToolbarIconBtn
        testId="ai-toolbar-run-tests"
        title={t("ai.toolbar.runTests")}
        disabled={verifyDisabled}
        active={verifyInFlight === "tests"}
        onClick={() => void runWorkspaceVerifyAndReport()}
      >
        {verifyInFlight === "tests" ? "⏳" : "▶"}
      </ToolbarIconBtn>

      <ToolbarIconBtn
        testId="ai-toolbar-run-build"
        title={t("ai.toolbar.runBuild")}
        disabled={verifyDisabled}
        active={verifyInFlight === "build"}
        onClick={() => void runBuildAndReport()}
      >
        {verifyInFlight === "build" ? "⏳" : "⚒"}
      </ToolbarIconBtn>

      <div ref={quickRef} style={{ position: "relative" }}>
        <button
          type="button"
          data-testid="ai-toolbar-quick-actions"
          title={t("ai.toolbar.quickActions")}
          onClick={() => {
            setToolsOpen(false);
            setQuickOpen((v) => !v);
          }}
          style={{
            height: 24,
            padding: "0 8px",
            borderRadius: 4,
            border: "1px solid var(--caval-border)",
            background: quickOpen ? "var(--caval-accent-glow)" : "var(--caval-surface-raised)",
            color: quickOpen ? "var(--caval-accent)" : "var(--caval-text-muted)",
            cursor: "pointer",
            fontSize: 10,
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          {t("ai.toolbar.quickActions")} ▾
        </button>
        {quickOpen ? (
          <div
            data-testid="ai-toolbar-quick-menu"
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              minWidth: 160,
              zIndex: 20,
              padding: 4,
              borderRadius: 6,
              border: "1px solid var(--caval-border)",
              background: "var(--caval-surface-raised)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            }}
          >
            {AI_ONBOARDING_SUGGESTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                data-testid={`ai-toolbar-quick-${s.id}`}
                onClick={() => handleQuickAction(s.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  border: "none",
                  borderRadius: 4,
                  background: "transparent",
                  color: "var(--caval-text)",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                {t(`ai.toolbar.${s.id === "fix" ? "fixBug" : s.id === "explain" ? "explainCode" : s.id === "refactor" ? "refactor" : "previewApp"}`)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div ref={toolsRef} style={{ position: "relative" }}>
        <ToolbarIconBtn
          testId="ai-toolbar-tools-info"
          title={t("ai.toolbar.toolsInfo")}
          active={toolsOpen}
          onClick={() => {
            closeMenus();
            setToolsOpen((v) => !v);
          }}
        >
          ⓘ
        </ToolbarIconBtn>
        {toolsOpen ? (
          <div
            data-testid="ai-toolbar-tools-popover"
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              width: 260,
              zIndex: 20,
              padding: 10,
              borderRadius: 6,
              border: "1px solid var(--caval-border)",
              background: "var(--caval-surface-raised)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            }}
          >
            <AiToolsInfoContent />
          </div>
        ) : null}
      </div>

      {actionHint ? (
        <span
          role="status"
          data-testid="ai-toolbar-action-hint"
          style={{ fontSize: 9.5, color: "var(--caval-accent)", maxWidth: 120, lineHeight: 1.3 }}
        >
          {actionHint}
        </span>
      ) : null}
    </div>
  );
}
