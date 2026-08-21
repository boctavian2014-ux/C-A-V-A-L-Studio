/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FileTree } from "../../src/renderer/components/sidebar/FileTree";
import { useEditorStore } from "../../src/renderer/store/editor-store";
import { I18nProvider } from "../../ai/i18n/I18nProvider";

vi.mock("../../src/renderer/hooks/useOpenWorkspace", () => ({
  useOpenWorkspace: () => ({
    pickAndOpenFolder: vi.fn(async () => undefined),
  }),
}));

vi.mock("../../themes/theme-provider", () => ({
  useCavalTheme: () => ({
    mode: "dark",
    setMode: () => undefined,
    theme: {
      mode: "dark",
      colors: {
        surface: "#111",
        border: "#222",
        textMuted: "#888",
        text: "#eee",
        accent: "#0ef",
        bg: "#0E0E0F",
        surfaceRaised: "#161b22",
      },
    },
  }),
}));

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

describe("ExplorerPanel — no preview section", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    useEditorStore.setState({
      projectPath: null,
      fileTree: [],
    } as never);
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
  });

  it("does not render PREVIEW section heading", () => {
    const result = mount(<FileTree />);
    mounted = result;
    expect(result.container.textContent).not.toMatch(/\bPREVIEW\b/i);
    expect(result.container.querySelector(".preview-panel")).toBeNull();
  });

  it("does not render Open Web / Open Mobile buttons", () => {
    const result = mount(<FileTree />);
    mounted = result;
    const text = result.container.textContent ?? "";
    expect(text).not.toMatch(/Open Web/i);
    expect(text).not.toMatch(/Open Mobile/i);
  });

  it("does not render Configure in caval.jsonc buttons", () => {
    const result = mount(<FileTree />);
    mounted = result;
    expect(result.container.textContent).not.toMatch(/Configure in caval\.jsonc/i);
  });

  it("still renders empty-state open project flow when no folder is open", () => {
    const result = mount(
      <I18nProvider initialLocale="ro">
        <FileTree />
      </I18nProvider>
    );
    mounted = result;
    expect(result.container.textContent).toMatch(/Deschide un folder pentru a începe/i);
    expect(result.container.textContent).toMatch(/Deschide folder/i);
  });
});
