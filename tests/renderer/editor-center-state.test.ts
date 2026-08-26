import { describe, expect, it } from "vitest";

import { resolveEditorCenterState } from "../../src/renderer/components/editor/editor-center-state";

describe("resolveEditorCenterState", () => {
  const base = {
    hasActiveTab: false,
    projectPath: null as string | null,
    hasFileReadError: false,
    loadTimedOut: false,
    monacoMounted: false,
    cadStlUrl: null as string | null,
    isStreaming: false,
  };

  it("renders monaco for a valid open tab instead of an empty pane", () => {
    expect(
      resolveEditorCenterState({
        ...base,
        hasActiveTab: true,
        projectPath: "C:\\proj",
        monacoMounted: true,
      })
    ).toBe("monaco");
  });

  it("keeps monaco (loading) during a tab switch instead of a load-error", () => {
    expect(
      resolveEditorCenterState({
        ...base,
        hasActiveTab: true,
        projectPath: "C:\\proj",
        monacoMounted: false,
        loadTimedOut: false,
      })
    ).toBe("monaco");
  });

  it("shows an explicit file-read error when the path is invalid and no tab exists", () => {
    expect(
      resolveEditorCenterState({
        ...base,
        projectPath: "C:\\proj",
        hasFileReadError: true,
      })
    ).toBe("file-error");
  });

  it("does not fall back to welcome while a workspace is open without a tab", () => {
    expect(
      resolveEditorCenterState({
        ...base,
        projectPath: "C:\\proj",
      })
    ).toBe("empty-workspace");
  });

  it("shows welcome only when no workspace is bound", () => {
    expect(resolveEditorCenterState(base)).toBe("welcome");
  });

  it("shows load-error only after timeout without a mount", () => {
    expect(
      resolveEditorCenterState({
        ...base,
        hasActiveTab: true,
        loadTimedOut: true,
        monacoMounted: false,
      })
    ).toBe("load-error");
  });
});
