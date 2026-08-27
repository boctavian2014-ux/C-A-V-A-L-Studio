/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkbenchMenuBar } from "../../src/renderer/components/workbench/WorkbenchMenuBar";

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

describe("WorkbenchMenuBar", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    vi.unstubAllGlobals();
  });

  it("renders top-level labels on the graphite bar and pops the native submenu", async () => {
    const popup = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("caval", {
      appMenu: {
        usesInRendererBar: true,
        topLevel: async () => [
          { index: 0, label: "File" },
          { index: 1, label: "Edit" },
        ],
        popup,
      },
    });
    Object.defineProperty(window, "caval", {
      configurable: true,
      value: (globalThis as { caval: unknown }).caval,
    });

    const view = mount(<WorkbenchMenuBar />);
    mounted = view;
    await act(async () => {
      await Promise.resolve();
    });

    const bar = view.container.querySelector('[data-testid="workbench-menubar"]');
    expect(bar).toBeTruthy();
    expect(bar?.classList.contains("workbench-menubar")).toBe(true);
    const buttons = Array.from(view.container.querySelectorAll("button"));
    expect(buttons.map((b) => b.textContent)).toEqual(["File", "Edit"]);

    act(() => {
      buttons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(popup).toHaveBeenCalledTimes(1);
    expect(popup.mock.calls[0]?.[0]).toMatchObject({ index: 0 });
  });

  it("stays hidden when the native macOS menu is used", () => {
    Object.defineProperty(window, "caval", {
      configurable: true,
      value: { appMenu: { usesInRendererBar: false, topLevel: async () => [{ index: 0, label: "File" }] } },
    });
    const view = mount(<WorkbenchMenuBar />);
    mounted = view;
    expect(view.container.querySelector('[data-testid="workbench-menubar"]')).toBeNull();
  });
});
