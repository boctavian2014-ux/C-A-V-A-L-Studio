/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateAiPreview = vi.fn();
const setActiveTab = vi.fn();
const openFile = vi.fn(async () => undefined);
const stopStreaming = vi.fn();

let editorState = {
  projectPath: "C:\\proj",
  tabs: [] as Array<{ id: string; path: string; isAiPreview?: boolean }>,
  activeTabId: null as string | null,
  openFile,
  setActiveTab,
  updateAiPreview,
};

let workCanvasState = {
  followAi: true,
  editorLoadErrorPath: null as string | null,
  lastFollowedPath: null as string | null,
  setFollowAi: vi.fn((enabled: boolean) => {
    workCanvasState.followAi = enabled;
  }),
  onStreamStart: vi.fn(() => {
    workCanvasState.followAi = true;
  }),
  onStreamEnd: vi.fn(() => {
    workCanvasState.followAi = false;
  }),
  setEditorLoadErrorPath: vi.fn(),
  setLastFollowedPath: vi.fn(),
};

let aiState = {
  isStreaming: false,
  stopStreaming,
};

let liveEditsState = {
  edits: {} as Record<string, { path: string; status: string; content?: string; updatedAt: number }>,
  order: [] as string[],
};

vi.mock("../../src/renderer/store/editor-store", () => ({
  AI_PREVIEW_TAB_ID: "caval-ai-live-preview",
  useEditorStore: Object.assign(
    (select?: (s: typeof editorState) => unknown) => (select ? select(editorState) : editorState),
    { getState: () => editorState }
  ),
}));

vi.mock("../../src/renderer/store/ai-work-canvas-store", () => ({
  useAiWorkCanvasStore: Object.assign(
    (select?: (s: typeof workCanvasState) => unknown) =>
      select ? select(workCanvasState) : workCanvasState,
    { getState: () => workCanvasState }
  ),
}));

vi.mock("../../ai/composer/ai-store", () => ({
  useAIStore: Object.assign(
    (select?: (s: typeof aiState) => unknown) => (select ? select(aiState) : aiState),
    { getState: () => aiState }
  ),
}));

vi.mock("../../ai/composer/live-ai-edits-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../ai/composer/live-ai-edits-store")>();
  return {
    ...actual,
    useLiveAiEditsStore: Object.assign(
      (select?: (s: typeof liveEditsState) => unknown) =>
        select ? select(liveEditsState) : liveEditsState,
      { getState: () => liveEditsState }
    ),
  };
});

vi.mock("../../ai/i18n/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const table: Record<string, string> = {
        "workCanvas.title": "Building your project",
        "workCanvas.hint": "Open the Coding Arena to follow progress",
        "workCanvas.step.preparing": "Preparing workspace",
        "workCanvas.step.creating": "Creating files",
        "workCanvas.step.writing": "Writing code",
        "workCanvas.step.writingPath": `Writing ${params?.path ?? ""}`,
        "workCanvas.step.preview": "Starting preview when ready",
        "workCanvas.header.title": "AI is writing",
        "workCanvas.header.writing": "Writing…",
        "workCanvas.header.preview": "Preview",
        "workCanvas.header.openFile": "Open file",
        "workCanvas.header.followOn": "Follow AI: On",
        "workCanvas.header.followOff": "Follow AI: Off",
        "workCanvas.header.stop": "Stop",
        "common.retry": "Retry",
        "workCanvas.loadError": `Could not open ${params?.path ?? ""}`,
        "loading.editor": "Loading editor…",
        "editor.unsavedChanges": "Unsaved",
      };
      return table[key] ?? key;
    },
  }),
}));

import {
  deriveWorkCanvasSteps,
  getCurrentWritingPath,
} from "../../src/renderer/ai/work-canvas-steps";
import { AiWorkCanvas } from "../../src/renderer/components/editor/AiWorkCanvas";
import { AiEditorHeader } from "../../src/renderer/components/editor/AiEditorHeader";
import { useAiWorkCanvasController } from "../../src/renderer/hooks/use-ai-work-canvas";

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

function Harness() {
  useAiWorkCanvasController();
  return null;
}

describe("work-canvas-steps", () => {
  it("picks the latest writing path from order", () => {
    const edits = {
      "a.ts": { path: "a.ts", status: "done" as const, updatedAt: 1 },
      "b.ts": { path: "b.ts", status: "writing" as const, updatedAt: 2 },
    };
    expect(getCurrentWritingPath(["a.ts", "b.ts"], edits)).toBe("b.ts");
  });

  it("derives real progress steps without fake percentages", () => {
    const steps = deriveWorkCanvasSteps({
      hasProject: true,
      isStreaming: true,
      order: ["src/App.tsx"],
      edits: {
        "src/App.tsx": { path: "src/App.tsx", status: "writing", content: "x", updatedAt: 1 },
      },
      previewStarting: false,
    });
    expect(steps).toHaveLength(3);
    expect(steps.find((s) => s.id === "preparing")?.status).toBe("done");
    expect(steps.find((s) => s.id === "writing")?.status).toBe("active");
    expect(steps.find((s) => s.id === "writing")?.detailPath).toBe("src/App.tsx");
  });
});

describe("useAiWorkCanvasController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workCanvasState.followAi = true;
    aiState.isStreaming = false;
    liveEditsState.edits = {};
    liveEditsState.order = [];
    editorState.tabs = [];
    editorState.activeTabId = null;
  });

  it("opens preview for first writing path while followAi is on", () => {
    aiState.isStreaming = true;
    liveEditsState.order = ["src/App.tsx"];
    liveEditsState.edits = {
      "src/App.tsx": {
        path: "src/App.tsx",
        status: "writing",
        content: "export default function App() {}",
        updatedAt: Date.now(),
      },
    };

    mount(<Harness />);

    expect(updateAiPreview).toHaveBeenCalledWith(
      "src/App.tsx",
      "export default function App() {}"
    );
  });

  it("follows the second file when writing moves on", () => {
    aiState.isStreaming = true;
    workCanvasState.followAi = true;
    liveEditsState.order = ["src/App.tsx", "src/main.tsx"];
    liveEditsState.edits = {
      "src/App.tsx": { path: "src/App.tsx", status: "done", updatedAt: 1 },
      "src/main.tsx": {
        path: "src/main.tsx",
        status: "writing",
        content: "import App from './App'",
        updatedAt: 2,
      },
    };

    mount(<Harness />);

    expect(updateAiPreview).toHaveBeenCalledWith(
      "src/main.tsx",
      "import App from './App'"
    );
  });

  it("does not switch tabs when followAi is off", () => {
    aiState.isStreaming = true;
    workCanvasState.followAi = false;
    liveEditsState.order = ["src/App.tsx"];
    liveEditsState.edits = {
      "src/App.tsx": { path: "src/App.tsx", status: "writing", content: "x", updatedAt: 1 },
    };

    mount(<Harness />);

    expect(updateAiPreview).not.toHaveBeenCalled();
  });

  it("turns followAi off when stream ends", () => {
    const { unmount, rerender } = (() => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      const ui = <Harness />;
      act(() => root.render(ui));
      return {
        unmount: () => {
          act(() => root.unmount());
          container.remove();
        },
        rerender: () => act(() => root.render(<Harness />)),
      };
    })();

    aiState.isStreaming = true;
    rerender();
    aiState.isStreaming = false;
    rerender();
    expect(workCanvasState.onStreamEnd).toHaveBeenCalled();
    unmount();
  });
});

describe("AiWorkCanvas", () => {
  beforeEach(() => {
    aiState.isStreaming = true;
    editorState.projectPath = "C:\\proj";
    liveEditsState.order = [];
    liveEditsState.edits = {};
  });

  it("shows building canvas while streaming without files", () => {
    const { container, unmount } = mount(<AiWorkCanvas />);
    expect(container.querySelector('[data-testid="ai-work-canvas"]')).toBeTruthy();
    expect(container.textContent).toContain("Building your project");
    expect(container.textContent).toContain("Preparing workspace");
    unmount();
  });
});

describe("AiEditorHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workCanvasState.followAi = true;
    liveEditsState.order = ["src/App.tsx"];
    liveEditsState.edits = {
      "src/App.tsx": { path: "src/App.tsx", status: "writing", content: "x", updatedAt: 1 },
    };
  });

  it("exposes follow toggle with aria-pressed", () => {
    const { container, unmount } = mount(
      <AiEditorHeader relativePath="src/App.tsx" isStreaming />
    );
    const toggle = container.querySelector('[data-testid="ai-editor-follow-toggle"]') as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    unmount();
  });

  it("disables follow when open file is clicked", () => {
    const { container, unmount } = mount(
      <AiEditorHeader relativePath="src/App.tsx" isStreaming />
    );
    act(() => {
      container
        .querySelector('[data-testid="ai-editor-open-file"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(workCanvasState.setFollowAi).toHaveBeenCalledWith(false);
    expect(openFile).toHaveBeenCalled();
    unmount();
  });
});
