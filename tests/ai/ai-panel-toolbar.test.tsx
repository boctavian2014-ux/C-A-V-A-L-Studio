/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setAgentMode = vi.fn();
const setIdeContextMode = vi.fn();
const setIncludeMode = vi.fn();
const runWorkspaceVerifyAndReport = vi.fn(async () => undefined);
const runBuildAndReport = vi.fn(async () => undefined);
const onStartChat = vi.fn();

let aiState = {
  agentMode: "code" as const,
  setAgentMode,
  ideContextMode: "enabled" as const,
  setIdeContextMode,
  includeMode: "project" as const,
  setIncludeMode,
  verifyInFlight: "none" as const,
  runWorkspaceVerifyAndReport,
  runBuildAndReport,
};

let editorState = {
  projectPath: "C:\\proj",
  editorSelection: null as null | { text: string; startLine: number; endLine: number },
};

vi.mock("../../ai/composer/ai-store", () => ({
  useAIStore: (select?: (s: typeof aiState) => unknown) =>
    select ? select(aiState) : aiState,
}));

vi.mock("../../src/renderer/store/editor-store", () => ({
  useEditorStore: (select?: (s: typeof editorState) => unknown) =>
    select ? select(editorState) : editorState,
}));

vi.mock("../../ai/i18n/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const table: Record<string, string> = {
        "ai.toolbar.mode": "Agent mode",
        "ai.toolbar.ideContext": "IDE context",
        "ai.toolbar.selectionContext": "Selection context",
        "ai.toolbar.runTests": "Run tests",
        "ai.toolbar.runBuild": "Run build",
        "ai.toolbar.quickActions": "Quick actions",
        "ai.toolbar.fixBug": "Fix a bug",
        "ai.toolbar.explainCode": "Explain code",
        "ai.toolbar.refactor": "Refactor",
        "ai.toolbar.previewApp": "Preview my app",
        "ai.toolbar.toolsInfo": "What tools does AI have access to?",
      };
      return table[key] ?? key;
    },
  }),
}));

vi.mock("../../src/renderer/ai/explain-controller", () => ({
  startExplainForSelection: vi.fn(async () => undefined),
}));

const togglePreviewFromRail = vi.hoisted(() => vi.fn());

vi.mock("../../src/renderer/components/sidebar/ActivityBar", () => ({
  togglePreviewFromRail,
  ActivityBar: () => null,
}));

import { startExplainForSelection } from "../../src/renderer/ai/explain-controller";
import { AiPanelToolbar } from "../../ai/composer/AiPanelToolbar";

function mount(ui: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = createRoot(container);
  act(() => {
    root?.render(ui);
  });
  return {
    container,
    unmount() {
      act(() => {
        root?.unmount();
        root = null;
      });
      container.remove();
    },
  };
}

describe("AiPanelToolbar", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    aiState = {
      agentMode: "code",
      setAgentMode,
      ideContextMode: "enabled",
      setIdeContextMode,
      includeMode: "project",
      setIncludeMode,
      verifyInFlight: "none",
      runWorkspaceVerifyAndReport,
      runBuildAndReport,
    };
    editorState = { projectPath: "C:\\proj", editorSelection: null };
    onStartChat.mockReset();
    setAgentMode.mockReset();
    setIdeContextMode.mockReset();
    setIncludeMode.mockReset();
    runWorkspaceVerifyAndReport.mockReset();
    runBuildAndReport.mockReset();
    vi.mocked(startExplainForSelection).mockReset();
    togglePreviewFromRail.mockReset();
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    vi.restoreAllMocks();
  });

  it("renders mode selector, IDE context, run tests/build, quick actions, tools info", () => {
    const { container, unmount } = mount(
      <AiPanelToolbar isStreaming={false} onStartChat={onStartChat} />
    );
    mounted = { unmount };
    expect(container.querySelector('[data-testid="ai-panel-toolbar"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="chat-mode-select"] select')).toBeTruthy();
    expect(container.querySelector('[data-testid="ai-toolbar-ide-context"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="ai-toolbar-run-tests"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="ai-toolbar-run-build"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="ai-toolbar-quick-actions"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="ai-toolbar-tools-info"]')).toBeTruthy();
  });

  it("does not show tools info popover until info icon is clicked", () => {
    const { container, unmount } = mount(
      <AiPanelToolbar isStreaming={false} onStartChat={onStartChat} />
    );
    mounted = { unmount };
    expect(container.querySelector('[data-testid="ai-toolbar-tools-popover"]')).toBeNull();
    act(() => {
      container
        .querySelector('[data-testid="ai-toolbar-tools-info"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="ai-toolbar-tools-popover"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="ai-tools-info-content"]')).toBeTruthy();
  });

  it("changes agent mode via compact selector", () => {
    const { container, unmount } = mount(
      <AiPanelToolbar isStreaming={false} onStartChat={onStartChat} />
    );
    mounted = { unmount };
    const select = container.querySelector(
      '[data-testid="chat-mode-select"] select'
    ) as HTMLSelectElement;
    act(() => {
      select.value = "agentic";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(setAgentMode).toHaveBeenCalledWith("agentic");
  });

  it("toggles IDE context", () => {
    const { container, unmount } = mount(
      <AiPanelToolbar isStreaming={false} onStartChat={onStartChat} />
    );
    mounted = { unmount };
    act(() => {
      container
        .querySelector('[data-testid="ai-toolbar-ide-context"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(setIdeContextMode).toHaveBeenCalledWith("disabled");
  });

  it("runs tests and build from toolbar", () => {
    const { container, unmount } = mount(
      <AiPanelToolbar isStreaming={false} onStartChat={onStartChat} />
    );
    mounted = { unmount };
    act(() => {
      container
        .querySelector('[data-testid="ai-toolbar-run-tests"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(runWorkspaceVerifyAndReport).toHaveBeenCalled();
    act(() => {
      container
        .querySelector('[data-testid="ai-toolbar-run-build"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(runBuildAndReport).toHaveBeenCalled();
  });

  it("quick action fix bug starts chat with prompt", () => {
    const { container, unmount } = mount(
      <AiPanelToolbar isStreaming={false} onStartChat={onStartChat} />
    );
    mounted = { unmount };
    act(() => {
      container
        .querySelector('[data-testid="ai-toolbar-quick-actions"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      container
        .querySelector('[data-testid="ai-toolbar-quick-fix"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onStartChat).toHaveBeenCalledWith("Fix the errors in my current file");
  });

  it("quick action explain runs explain controller instead of chat", () => {
    const { container, unmount } = mount(
      <AiPanelToolbar isStreaming={false} onStartChat={onStartChat} />
    );
    mounted = { unmount };
    act(() => {
      container
        .querySelector('[data-testid="ai-toolbar-quick-actions"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      container
        .querySelector('[data-testid="ai-toolbar-quick-explain"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onStartChat).not.toHaveBeenCalled();
    expect(startExplainForSelection).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="ai-toolbar-action-hint"]')).toBeNull();
  });

  it("quick action preview opens the preview rail instead of chatting", () => {
    const { container, unmount } = mount(
      <AiPanelToolbar isStreaming={false} onStartChat={onStartChat} />
    );
    mounted = { unmount };
    act(() => {
      container
        .querySelector('[data-testid="ai-toolbar-quick-actions"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      container
        .querySelector('[data-testid="ai-toolbar-quick-preview"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onStartChat).not.toHaveBeenCalled();
    expect(togglePreviewFromRail).toHaveBeenCalledWith("web");
  });
});
