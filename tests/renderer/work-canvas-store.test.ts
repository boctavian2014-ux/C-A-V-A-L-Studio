/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";

import { useAiWorkCanvasStore } from "../../src/renderer/store/ai-work-canvas-store";
import { useEditorStore } from "../../src/renderer/store/editor-store";

describe("ai-work-canvas-store + editor-store", () => {
  beforeEach(() => {
    useAiWorkCanvasStore.setState({
      followAi: true,
      editorLoadErrorPath: null,
      lastFollowedPath: null,
    });
    useEditorStore.setState({
      tabs: [
        {
          id: "a",
          name: "a.ts",
          path: "/proj/a.ts",
          content: "",
          language: "typescript",
          isDirty: false,
        },
        {
          id: "b",
          name: "b.ts",
          path: "/proj/b.ts",
          content: "",
          language: "typescript",
          isDirty: false,
        },
      ],
      activeTabId: "a",
    });
  });

  it("disables followAi when user selects another tab", () => {
    useEditorStore.getState().setActiveTab("b", { byUser: true });
    expect(useAiWorkCanvasStore.getState().followAi).toBe(false);
    expect(useEditorStore.getState().activeTabId).toBe("b");
  });

  it("onStreamEnd disables followAi", () => {
    useAiWorkCanvasStore.getState().onStreamEnd();
    expect(useAiWorkCanvasStore.getState().followAi).toBe(false);
  });
});
