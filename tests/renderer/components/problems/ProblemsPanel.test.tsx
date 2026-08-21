/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProblemsPanel } from "../../../../src/renderer/components/problems/ProblemsPanel";
import { useEditorStore } from "../../../../src/renderer/store/editor-store";
import { useProblemsStore } from "../../../../src/renderer/store/problems-store";
import type { Problem, ProblemsApi, ProblemsSummary } from "../../../../src/shared/problems-contract";

const emptySummary: ProblemsSummary = { total: 0, errors: 0, warnings: 0, infos: 0, hints: 0 };

function sampleProblems(): Problem[] {
  return [
    {
      id: "ts-src/app.ts-4-2-TS2322",
      file: "src/app.ts",
      line: 4,
      column: 2,
      severity: "error",
      source: "typescript",
      message: "Type mismatch",
      code: "TS2322",
    },
    {
      id: "eslint-src/util.ts-1-1-no-unused-vars",
      file: "src/util.ts",
      line: 1,
      column: 1,
      severity: "warning",
      source: "eslint",
      message: "Unused var",
      code: "no-unused-vars",
    },
  ];
}

function createProblemsMock(initial: Problem[] = []) {
  const problemListeners: Array<(next: Problem[]) => void> = [];
  const summaryListeners: Array<(next: ProblemsSummary) => void> = [];
  const unsubscribeProblems = vi.fn();
  const unsubscribeSummary = vi.fn();

  const api: ProblemsApi = {
    getProblems: vi.fn(async () => initial),
    getSummary: vi.fn(async () => emptySummary),
    refresh: vi.fn(async () => undefined),
    onProblemsChanged: vi.fn((cb) => {
      problemListeners.push(cb);
      return unsubscribeProblems;
    }),
    onSummaryChanged: vi.fn((cb) => {
      summaryListeners.push(cb);
      return unsubscribeSummary;
    }),
  };

  return { api, problemListeners, summaryListeners, unsubscribeProblems, unsubscribeSummary };
}

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

describe("ProblemsPanel", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    useProblemsStore.getState().clearProblems();
    useEditorStore.setState({ projectPath: null });
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    useProblemsStore.getState().clearProblems();
    useEditorStore.setState({ projectPath: null });
    vi.restoreAllMocks();
  });

  async function renderPanel(api: ProblemsApi) {
    window.caval = { problems: api } as unknown as Window["caval"];
    const result = mount(<ProblemsPanel />);
    mounted = result;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    return result;
  }

  it("renders the empty state when there are no problems", async () => {
    const { api } = createProblemsMock();
    const { container } = await renderPanel(api);
    expect(container.querySelector('[data-testid="problems-empty"]')?.textContent).toMatch(
      /No problems detected/i
    );
    expect(api.getProblems).toHaveBeenCalledTimes(1);
    expect(api.refresh).not.toHaveBeenCalled();
  });

  it("updates the list from onProblemsChanged", async () => {
    const { api, problemListeners } = createProblemsMock();
    const { container } = await renderPanel(api);
    act(() => {
      problemListeners[0]?.(sampleProblems());
    });
    const items = container.querySelectorAll('[data-testid="problem-item"]');
    expect(items.length).toBe(2);
    expect(container.textContent).toContain("Type mismatch");
    expect(container.textContent).toContain("src/app.ts");
  });

  it("filters by severity", async () => {
    const { api, problemListeners } = createProblemsMock();
    const { container } = await renderPanel(api);
    act(() => {
      problemListeners[0]?.(sampleProblems());
    });
    const select = container.querySelector(
      '[data-testid="problems-filter-severity"]'
    ) as HTMLSelectElement;
    act(() => {
      select.value = "error";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const items = container.querySelectorAll('[data-testid="problem-item"]');
    expect(items.length).toBe(1);
    expect(items[0]?.textContent).toContain("Type mismatch");
    expect(container.textContent).not.toContain("Unused var");
  });

  it("clicking a problem reveals the file at line and column", async () => {
    const { api, problemListeners } = createProblemsMock();
    const { container } = await renderPanel(api);
    act(() => {
      problemListeners[0]?.(sampleProblems());
    });

    const details: Array<{ path: string; line: number; col?: number }> = [];
    const onReveal = (event: Event) => {
      details.push((event as CustomEvent<{ path: string; line: number; col?: number }>).detail);
    };
    document.addEventListener("caval:reveal-line", onReveal);
    const item = container.querySelector('[data-testid="problem-item"]') as HTMLButtonElement;
    act(() => {
      item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    document.removeEventListener("caval:reveal-line", onReveal);

    expect(details[0]?.path).toBe("src/app.ts");
    expect(details[0]?.line).toBe(4);
    expect(details[0]?.col).toBe(2);
  });

  it("unsubscribes on unmount", async () => {
    const { api, unsubscribeProblems, unsubscribeSummary } = createProblemsMock();
    const { unmount } = await renderPanel(api);
    unmount();
    mounted = undefined;
    expect(unsubscribeProblems).toHaveBeenCalledTimes(1);
    expect(unsubscribeSummary).toHaveBeenCalledTimes(1);
  });
});
