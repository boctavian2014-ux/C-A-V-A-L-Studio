/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/renderer/monaco-setup", () => ({}));
vi.mock("monaco-editor", () => ({
  editor: {},
  languages: { typescript: {} },
}));
vi.mock("@monaco-editor/loader", () => ({ default: { config: vi.fn() } }));

vi.mock("@monaco-editor/react", async () => {
  const React = await import("react");
  function MockEditor(props: {
    value?: string;
    onMount?: (editor: unknown, monaco: unknown) => void;
  }) {
    React.useEffect(() => {
      const editor = {
        addCommand: vi.fn(),
        addAction: vi.fn(() => ({ dispose: vi.fn() })),
        focus: vi.fn(),
        getModel: () => null,
        getSelection: () => null,
        getPosition: () => null,
        onDidChangeCursorSelection: vi.fn(),
        onDidChangeCursorPosition: vi.fn(),
        onDidDispose: vi.fn((cb: () => void) => cb),
        updateOptions: vi.fn(),
        deltaDecorations: () => [],
        revealLine: vi.fn(),
        restoreViewState: vi.fn(),
        saveViewState: vi.fn(),
      };
      const monaco = {
        KeyMod: { CtrlCmd: 1, Shift: 2 },
        KeyCode: { KeyS: 1, KeyE: 2, KeyR: 3 },
        Range: class {
          constructor(..._args: unknown[]) {}
        },
        editor: { registerCommand: () => ({ dispose: vi.fn() }) },
        languages: {
          registerInlineCompletionsProvider: () => ({ dispose: vi.fn() }),
          registerHoverProvider: () => ({ dispose: vi.fn() }),
          registerCodeActionProvider: () => ({ dispose: vi.fn() }),
        },
      };
      props.onMount?.(editor, monaco);
    }, [props]);
    return React.createElement("pre", { "data-testid": "mock-monaco" }, props.value ?? "");
  }
  return { default: MockEditor, useMonaco: () => null };
});

vi.mock("../../src/renderer/components/engineering/EngineeringCadPreview", () => ({
  EngineeringCadPreview: () => null,
}));
vi.mock("../../src/renderer/components/workbench/WelcomeWorkspacePanel", () => ({
  WelcomeWorkspacePanel: () =>
    (require("react") as typeof import("react")).createElement("div", {
      "data-testid": "welcome-workspace",
    }, "welcome"),
}));
vi.mock("../../src/renderer/components/editor/AiWorkCanvas", () => ({
  AiWorkCanvas: () =>
    (require("react") as typeof import("react")).createElement("div", {
      "data-testid": "ai-work-canvas",
    }),
}));
vi.mock("../../src/renderer/components/editor/AiEditorHeader", () => ({
  AiEditorHeader: () => null,
}));
vi.mock("../../src/renderer/components/ai/FeatureFirstUseTip", () => ({
  FeatureFirstUseTip: () => null,
}));
vi.mock("../../ai/composer/live-ai-edit-styles", () => ({
  ensureLiveAiEditStyles: () => undefined,
}));
vi.mock("../../src/renderer/store/editor-command-store", () => ({
  registerMonacoEditor: () => undefined,
}));
vi.mock("../../src/renderer/ai/inline-completion-provider", () => ({
  provideGatedInlineCompletion: async () => ({ suggestion: null }),
}));
vi.mock("../../src/renderer/store/onboarding-store", () => ({
  hasSeenFeature: () => true,
  markFeatureSeen: () => undefined,
}));
vi.mock("../../src/renderer/store/problems-store", () => ({
  useProblemsStore: Object.assign(() => ({ problems: [] }), {
    getState: () => ({ problems: [] }),
  }),
}));
vi.mock("../../src/renderer/store/settings-store", () => ({
  useSettingsStore: (select?: (s: { app: Record<string, unknown> }) => unknown) => {
    const s = { app: { fontSize: 13, tabSize: 2, wordWrap: false, minimap: false } };
    return select ? select(s) : s;
  },
}));
vi.mock("../../src/renderer/store/engineering-cad-store", () => ({
  useEngineeringCadStore: (select?: (s: { stlUrl: null }) => unknown) => {
    const s = { stlUrl: null };
    return select ? select(s) : s;
  },
}));
vi.mock("../../ai/composer/ai-store", () => ({
  useAIStore: Object.assign(
    (select?: (s: { isStreaming: boolean; includeMode: string }) => unknown) => {
      const s = { isStreaming: false, includeMode: "project", setIncludeMode: () => undefined };
      return select ? select(s) : s;
    },
    {
      getState: () => ({
        isStreaming: false,
        includeMode: "project",
        setIncludeMode: () => undefined,
      }),
    }
  ),
}));
vi.mock("../../ai/composer/live-ai-edits-store", () => ({
  useLiveAiEditsStore: (select?: (s: { edits: Record<string, never> }) => unknown) => {
    const s = { edits: {} };
    return select ? select(s) : s;
  },
  tabPathMatchesLiveEdit: () => false,
  computeLiveDiffLines: () => [],
}));
vi.mock("../../themes/theme-provider", () => ({
  useCavalTheme: () => ({
    theme: { colors: { border: "#222", text: "#fff", textMuted: "#888" } },
  }),
}));
vi.mock("../../ai/i18n/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (key === "workCanvas.fileReadError") return `Could not read ${params?.path ?? ""}`;
      if (key === "workCanvas.retryOpen") return "Try again";
      if (key === "editor.selectFile") return "Select a file in Explorer to open it.";
      if (key === "loading.editor") return "Loading editor…";
      return key;
    },
  }),
}));

import { MonacoEditor } from "../../src/renderer/components/editor/MonacoEditor";
import { useAiWorkCanvasStore } from "../../src/renderer/store/ai-work-canvas-store";
import { useEditorStore } from "../../src/renderer/store/editor-store";

function mount(ui: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = createRoot(container);
  act(() => {
    root?.render(ui);
  });
  return {
    container,
    rerender(next: ReactElement) {
      act(() => {
        root?.render(next);
      });
    },
    unmount() {
      act(() => {
        root?.unmount();
        root = null;
      });
      container.remove();
    },
  };
}

describe("MonacoEditor open states", () => {
  let view: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    useAiWorkCanvasStore.setState({
      followAi: false,
      editorLoadErrorPath: null,
      editorFileReadError: null,
      lastFollowedPath: null,
    });
    useEditorStore.setState({
      projectPath: String.raw`C:\proj`,
      tabs: [],
      activeTabId: null,
      fileTree: [],
    });
  });

  afterEach(() => {
    view?.unmount();
    view = undefined;
    vi.restoreAllMocks();
  });

  it("renders file content at startup instead of an empty pane", () => {
    useEditorStore.setState({
      tabs: [
        {
          id: "readme",
          name: "README.md",
          path: String.raw`C:\proj\README.md`,
          content: "# Hello from README",
          language: "markdown",
          isDirty: false,
        },
      ],
      activeTabId: "readme",
    });
    const mounted = mount(<MonacoEditor />);
    view = mounted;
    expect(mounted.container.querySelector('[data-testid="mock-monaco"]')?.textContent).toContain(
      "# Hello from README"
    );
    expect(mounted.container.querySelector('[data-testid="welcome-workspace"]')).toBeNull();
    expect(mounted.container.querySelector('[data-testid="editor-file-read-error"]')).toBeNull();
  });

  it("renders content when a tree file becomes the active tab", () => {
    const mounted = mount(<MonacoEditor />);
    view = mounted;
    act(() => {
      useEditorStore.setState({
        tabs: [
          {
            id: "app",
            name: "App.tsx",
            path: String.raw`C:\proj\src\App.tsx`,
            content: "export default function App() { return null; }",
            language: "typescript",
            isDirty: false,
          },
        ],
        activeTabId: "app",
      });
    });
    mounted.rerender(<MonacoEditor />);
    expect(mounted.container.querySelector('[data-testid="mock-monaco"]')?.textContent).toContain(
      "export default function App"
    );
  });

  it("shows an explicit error for a missing path instead of a silent empty editor", () => {
    useAiWorkCanvasStore.setState({
      editorFileReadError: { relativePath: "missing.md", code: "NOT_FOUND" },
    });
    const mounted = mount(<MonacoEditor />);
    view = mounted;
    expect(mounted.container.querySelector('[data-testid="editor-file-read-error"]')?.textContent).toMatch(
      /missing\.md/
    );
    expect(mounted.container.querySelector('[data-testid="welcome-workspace"]')).toBeNull();
    expect(mounted.container.querySelector('[data-testid="mock-monaco"]')).toBeNull();
  });

  it("does not stay on a load-error while switching tabs before timeout", () => {
    useEditorStore.setState({
      tabs: [
        {
          id: "a",
          name: "a.ts",
          path: String.raw`C:\proj\a.ts`,
          content: "export const a = 1;",
          language: "typescript",
          isDirty: false,
        },
        {
          id: "b",
          name: "b.ts",
          path: String.raw`C:\proj\b.ts`,
          content: "export const b = 2;",
          language: "typescript",
          isDirty: false,
        },
      ],
      activeTabId: "a",
    });
    const mounted = mount(<MonacoEditor />);
    view = mounted;
    act(() => {
      useEditorStore.setState({ activeTabId: "b" });
    });
    mounted.rerender(<MonacoEditor />);
    expect(mounted.container.querySelector('[data-testid="editor-load-error"]')).toBeNull();
    expect(mounted.container.querySelector('[data-testid="mock-monaco"]')?.textContent).toContain(
      "export const b = 2;"
    );
  });

  it("asks to select a file when a workspace is open but no tab exists", () => {
    const mounted = mount(<MonacoEditor />);
    view = mounted;
    expect(mounted.container.querySelector('[data-testid="editor-empty-open-workspace"]')).not.toBeNull();
    expect(mounted.container.querySelector('[data-testid="welcome-workspace"]')).toBeNull();
    expect(mounted.container.querySelector('[data-testid="mock-monaco"]')).toBeNull();
  });
});
