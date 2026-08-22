/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/renderer/store/editor-store", () => {
  const state = {
    refreshTree: vi.fn(async () => undefined),
  };
  const useEditorStore = Object.assign(
    (select?: (s: typeof state) => unknown) => (select ? select(state) : state),
    { getState: () => state }
  );
  return { useEditorStore };
});

vi.mock("@monaco-editor/react", () => ({
  useMonaco: () => null,
}));

import { WrittenFilesCard } from "../../ai/composer/WrittenFilesCard";

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

describe("WrittenFilesCard", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    window.caval = { fs: { readTree: vi.fn() } } as unknown as Window["caval"];
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
  });

  it("renders nothing without proposed writes", () => {
    const result = mount(<WrittenFilesCard />);
    mounted = result;
    expect(result.container.querySelector('[data-testid="written-files-card"]')).toBeNull();
    expect(result.container.querySelector('[data-testid="proposed-writes-card"]')).toBeNull();
  });

  it("renders proposed writes with Accept/Reject", () => {
    const result = mount(
      <WrittenFilesCard
        messageId="msg-1"
        proposedWrites={[
          {
            path: "src/App.tsx",
            content: "export {}\n",
            previousContent: "",
            isNew: true,
          },
        ]}
      />
    );
    mounted = result;
    expect(result.container.querySelector('[data-testid="proposed-writes-card"]')).toBeTruthy();
    expect(result.container.querySelector('[data-testid="proposed-writes-accept"]')).toBeTruthy();
    expect(result.container.querySelector('[data-testid="proposed-writes-reject"]')).toBeTruthy();
  });
});
