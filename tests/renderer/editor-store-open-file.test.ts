/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAiWorkCanvasStore } from "../../src/renderer/store/ai-work-canvas-store";
import { useEditorStore } from "../../src/renderer/store/editor-store";

const readFile = vi.fn();

beforeEach(() => {
  readFile.mockReset();
  (window as unknown as { caval: { fs: { readFile: typeof readFile } } }).caval = {
    fs: { readFile },
  };
  useAiWorkCanvasStore.setState({
    followAi: false,
    editorLoadErrorPath: null,
    editorFileReadError: null,
    lastFollowedPath: null,
  });
  useEditorStore.setState({
    projectPath: String.raw`C:\Users\octav\Desktop\WEBSITE CAVALLO`,
    tabs: [
      {
        id: "valid",
        name: "App.tsx",
        path: String.raw`C:\Users\octav\Desktop\WEBSITE CAVALLO\src\App.tsx`,
        content: "export default function App() {}",
        language: "typescript",
        isDirty: false,
      },
    ],
    activeTabId: "valid",
    fileTree: [],
  });
});

describe("editor-store openFile internal cache", () => {
  it("does not make context-cache the active document", async () => {
    readFile.mockResolvedValue({
      ok: true,
      path: ".caval/context-cache/documents.json",
      content: "[]",
      language: "json",
    });

    await useEditorStore.getState().openFile(
      String.raw`C:\Users\octav\Desktop\WEBSITE CAVALLO\.caval\context-cache\documents.json`
    );

    expect(readFile).not.toHaveBeenCalled();
    expect(useEditorStore.getState().activeTabId).toBe("valid");
    expect(useAiWorkCanvasStore.getState().editorFileReadError).toBeNull();
  });

  it("keeps the last valid tab when a persisted path is missing", async () => {
    readFile.mockResolvedValue({
      ok: false,
      code: "NOT_FOUND",
      message: "Could not open this workspace file.",
    });

    await useEditorStore.getState().openFile("missing.md");

    expect(useEditorStore.getState().activeTabId).toBe("valid");
    expect(useAiWorkCanvasStore.getState().editorFileReadError).toBeNull();
  });

  it("opens src/App.tsx when the agent reports that file", async () => {
    readFile.mockResolvedValue({
      ok: true,
      path: "src/App.tsx",
      content: "export default function App() { return null; }",
      language: "typescript",
    });

    useEditorStore.setState({ tabs: [], activeTabId: null });
    await useEditorStore.getState().openFile("src/App.tsx");

    expect(useEditorStore.getState().activeTabId?.replace(/\\/g, "/")).toContain("src/App.tsx");
    expect(useEditorStore.getState().tabs[0]?.content).toContain("return null");
  });

  it("ignores outside-workspace paths without blanking the editor", async () => {
    await useEditorStore.getState().openFile(String.raw`C:\Windows\System32\drivers\etc\hosts`);

    expect(readFile).not.toHaveBeenCalled();
    expect(useEditorStore.getState().activeTabId).toBe("valid");
    expect(useAiWorkCanvasStore.getState().editorFileReadError).toBeNull();
  });

  it("invalidates the active document when the workspace changes", () => {
    useEditorStore.getState().setEditorSelection({
      text: "App",
      path: String.raw`C:\Users\octav\Desktop\WEBSITE CAVALLO\src\App.tsx`,
      startLine: 1,
      endLine: 1,
      startColumn: 1,
      endColumn: 4,
    });
    useEditorStore.getState().setActiveSymbol("App");

    useEditorStore.getState().setProjectPath(String.raw`C:\Users\octav\Desktop\OTHER PROJECT`);

    expect(useEditorStore.getState().projectPath).toBe(String.raw`C:\Users\octav\Desktop\OTHER PROJECT`);
    expect(useEditorStore.getState().tabs).toEqual([]);
    expect(useEditorStore.getState().activeTabId).toBeNull();
    expect(useEditorStore.getState().editorSelection).toBeNull();
    expect(useEditorStore.getState().activeSymbol).toBeNull();
  });

  it("shows a read error instead of stale content when no valid tab exists", async () => {
    readFile.mockResolvedValue({
      ok: false,
      code: "NOT_FOUND",
      message: "Could not open this workspace file.",
    });
    useEditorStore.setState({ tabs: [], activeTabId: null });

    await useEditorStore.getState().openFile("missing.md");

    expect(useEditorStore.getState().tabs).toEqual([]);
    expect(useEditorStore.getState().activeTabId).toBeNull();
    expect(useAiWorkCanvasStore.getState().editorFileReadError).toEqual({
      relativePath: "missing.md",
      code: "NOT_FOUND",
    });
  });
});
