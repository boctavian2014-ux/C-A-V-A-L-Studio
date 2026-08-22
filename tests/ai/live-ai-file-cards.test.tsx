/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openFile = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock("../../src/renderer/store/editor-store", () => {
  const state = {
    projectPath: "C:\\proj",
    openFile: (...args: unknown[]) => openFile(...args),
  };
  const useEditorStore = Object.assign(
    (select?: (s: typeof state) => unknown) => (select ? select(state) : state),
    { getState: () => state }
  );
  return { useEditorStore };
});

vi.mock("../../ai/i18n/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const table: Record<string, string> = {
        "ai.files.liveAria": "AI files live",
        "ai.files.building": "Building files",
        "ai.files.writing": "Writing…",
        "ai.files.waiting": "Waiting",
        "ai.files.done": "Done",
        "ai.files.failed": "Failed",
        "ai.files.showMore": `Show ${params?.count ?? 0} more`,
        "ai.files.showLess": "Show less",
        "ai.files.viewAll": `View all ${params?.count ?? 0} files`,
        "ai.files.createdCount": `Created ${params?.count ?? 0} files`,
        "ai.files.writingCount": `AI writing ${params?.count ?? 0} file(s)…`,
        "ai.files.openPath": `Open ${params?.path ?? ""}`,
        "ai.files.openWeb": "Open Web",
        "ai.files.openMobile": "Open Mobile",
      };
      return table[key] ?? key;
    },
  }),
}));

import {
  LiveAiFileCards,
  sortEditsForDisplay,
  writtenFilesToEdits,
} from "../../ai/composer/LiveAiFileCards";
import type { LiveAiEdit } from "../../ai/composer/live-ai-edits-store";

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

function edits(paths: string[], status: LiveAiEdit["status"] = "waiting"): LiveAiEdit[] {
  const now = Date.now();
  return paths.map((path, i) => ({ path, status, updatedAt: now + i }));
}

describe("LiveAiFileCards helpers", () => {
  it("writtenFilesToEdits marks all done", () => {
    const rows = writtenFilesToEdits(["a.ts", "b.ts"]);
    expect(rows.every((r) => r.status === "done")).toBe(true);
  });

  it("sortEditsForDisplay prioritizes writing then waiting", () => {
    const sorted = sortEditsForDisplay([
      { path: "done.ts", status: "done", updatedAt: 1 },
      { path: "wait.ts", status: "waiting", updatedAt: 2 },
      { path: "write.ts", status: "writing", updatedAt: 3 },
    ]);
    expect(sorted.map((e) => e.path)).toEqual(["write.ts", "wait.ts", "done.ts"]);
  });
});

describe("LiveAiFileCards", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    openFile.mockClear();
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
  });

  it("returns null when no edits", () => {
    const result = mount(
      <LiveAiFileCards mode="streaming" edits={[]} onOpen={() => undefined} />
    );
    mounted = result;
    expect(result.container.querySelector('[data-testid="live-ai-file-cards"]')).toBeNull();
  });

  it("shows 5 of 8 with Show 3 more in streaming mode", () => {
    const eight = edits(
      [
        "f1.ts",
        "f2.ts",
        "f3.ts",
        "f4.ts",
        "f5.ts",
        "f6.ts",
        "f7.ts",
        "f8.ts",
      ],
      "waiting"
    );
    const result = mount(
      <LiveAiFileCards mode="streaming" edits={eight} onOpen={() => undefined} />
    );
    mounted = result;
    expect(result.container.querySelectorAll('[data-testid="live-ai-file-card"]')).toHaveLength(5);
    expect(result.container.textContent).toContain("Show 3 more");
    act(() => {
      result.container
        .querySelector('[data-testid="live-ai-file-cards-toggle"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(result.container.querySelectorAll('[data-testid="live-ai-file-card"]')).toHaveLength(8);
  });

  it("renders waiting writing done error statuses", () => {
    const list: LiveAiEdit[] = [
      { path: "w.ts", status: "waiting", updatedAt: 1 },
      { path: "wr.ts", status: "writing", updatedAt: 2 },
      { path: "d.ts", status: "done", updatedAt: 3 },
      { path: "e.ts", status: "error", updatedAt: 4 },
    ];
    const result = mount(
      <LiveAiFileCards mode="streaming" edits={list} onOpen={() => undefined} />
    );
    mounted = result;
    expect(result.container.querySelector('[data-status="waiting"]')).toBeTruthy();
    expect(result.container.querySelector('[data-status="writing"]')).toBeTruthy();
    expect(result.container.querySelector('[data-status="done"]')).toBeTruthy();
    expect(result.container.querySelector('[data-status="error"]')).toBeTruthy();
  });

  it("click opens file via onOpen", () => {
    const onOpen = vi.fn();
    const result = mount(
      <LiveAiFileCards
        mode="streaming"
        edits={edits(["src/App.tsx"], "writing")}
        onOpen={onOpen}
      />
    );
    mounted = result;
    act(() => {
      result.container
        .querySelector('[data-testid="live-ai-file-card"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onOpen).toHaveBeenCalledWith("src/App.tsx");
  });

  it("completed mode shows 3 of 8 with View all", () => {
    const eight = writtenFilesToEdits(
      ["f1.ts", "f2.ts", "f3.ts", "f4.ts", "f5.ts", "f6.ts", "f7.ts", "f8.ts"]
    );
    const result = mount(
      <LiveAiFileCards mode="completed" edits={eight} onOpen={() => undefined} />
    );
    mounted = result;
    expect(result.container.querySelectorAll('[data-testid="live-ai-file-card"]')).toHaveLength(3);
    expect(result.container.textContent).toContain("View all 8 files");
  });
});
