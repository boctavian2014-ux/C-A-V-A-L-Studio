/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openFile = vi.fn(async (..._args: unknown[]) => undefined);
const refreshTree = vi.fn(async (..._args: unknown[]) => undefined);
const startPreview = vi.fn(async () => undefined);

vi.mock("../../src/renderer/store/editor-store", () => {
  const state = {
    projectPath: "C:\\proj",
    openFile: (...args: unknown[]) => openFile(...args),
    refreshTree: (...args: unknown[]) => refreshTree(...args),
  };
  const useEditorStore = Object.assign(
    (select?: (s: typeof state) => unknown) => (select ? select(state) : state),
    { getState: () => state }
  );
  return { useEditorStore };
});

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
    openFile.mockClear();
    refreshTree.mockClear();
    startPreview.mockClear();
    window.caval = {
      preview: { start: startPreview },
      fs: { readTree: vi.fn() },
    } as unknown as Window["caval"];
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
  });

  it("lists every written file instead of truncating", () => {
    const files = [
      "api/matching_service.py",
      "src/fashion_matching/embeddings.py",
      "src/fashion_matching/matching.py",
      "src/fashion_matching/scoring.py",
      "src/fashion_matching/pipeline.py",
      "src/fashion_matching/types.py",
      "src/fashion_matching/similarity.py",
      "src/fashion_matching/output_formatter.py",
    ];
    const result = mount(<WrittenFilesCard files={files} />);
    mounted = result;
    expect(result.container.textContent).toContain("✓ 8 fișier(e) create în workspace");
    expect(result.container.textContent).not.toMatch(/scoring\.py…/);
    expect(result.container.querySelectorAll('[data-testid="written-file-open"]')).toHaveLength(8);
    expect(result.container.textContent).toContain("src/fashion_matching/output_formatter.py");
  });

  it("opens the clicked file in the editor", () => {
    const result = mount(<WrittenFilesCard files={["api/matching_service.py"]} />);
    mounted = result;
    act(() => {
      result.container
        .querySelector('[data-testid="written-file-open"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(openFile).toHaveBeenCalledWith("C:\\proj\\api\\matching_service.py");
  });

  it("starts web preview from the completion card", () => {
    const result = mount(<WrittenFilesCard files={["package.json"]} />);
    mounted = result;
    act(() => {
      result.container
        .querySelector('[data-testid="written-files-open-web"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(startPreview).toHaveBeenCalledWith("web");
  });
});
