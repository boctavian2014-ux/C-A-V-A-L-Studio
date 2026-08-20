/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TasksPanel } from "../../../../src/renderer/components/tasks/TasksPanel";
import { useEditorStore } from "../../../../src/renderer/store/editor-store";
import type { Task, TaskOutputChunk, TaskRun, TasksApi } from "../../../../src/shared/tasks-contract";

const sampleTasks: Task[] = [
  { name: "dev", command: "webpack --watch", source: "package.json" },
  { name: "test", command: "vitest run", source: "package.json" },
];

function running(taskName: string): TaskRun {
  return {
    id: `run-${taskName}`,
    taskName,
    status: "running",
    startedAt: Date.now(),
    finishedAt: null,
    exitCode: null,
    terminalId: `task:run-${taskName}`,
  };
}

function createTasksMock(initialTasks: Task[] = [], initialRuns: TaskRun[] = []) {
  const runListeners: Array<(run: TaskRun) => void> = [];
  const outputListeners: Array<(chunk: TaskOutputChunk) => void> = [];
  const unsubscribeRun = vi.fn();
  const unsubscribeOutput = vi.fn();

  const api: TasksApi = {
    list: vi.fn(async () => initialTasks),
    run: vi.fn(async (taskName) => running(taskName)),
    stop: vi.fn(async () => undefined),
    getRun: vi.fn(async (runId) => initialRuns.find((run) => run.id === runId) ?? running("dev")),
    getRuns: vi.fn(async () => initialRuns),
    onRunChanged: vi.fn((cb) => {
      runListeners.push(cb);
      return unsubscribeRun;
    }),
    onOutput: vi.fn((cb) => {
      outputListeners.push(cb);
      return unsubscribeOutput;
    }),
  };

  return { api, runListeners, outputListeners, unsubscribeRun, unsubscribeOutput };
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

describe("TasksPanel", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    useEditorStore.setState({ projectPath: "/repo" });
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    useEditorStore.setState({ projectPath: null });
    vi.restoreAllMocks();
  });

  async function renderPanel(api: TasksApi) {
    window.caval = { tasks: api } as Window["caval"];
    const result = mount(<TasksPanel />);
    mounted = result;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    return result;
  }

  it("renders the empty state when there are no tasks", async () => {
    const { api } = createTasksMock();
    const { container } = await renderPanel(api);
    expect(container.querySelector('[data-testid="tasks-empty"]')?.textContent).toMatch(
      /No tasks found/i
    );
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.run).not.toHaveBeenCalled();
  });

  it("updates the run list from onRunChanged", async () => {
    const { api, runListeners } = createTasksMock(sampleTasks);
    const { container } = await renderPanel(api);
    act(() => {
      runListeners[0]?.(running("dev"));
    });
    expect(container.textContent).toContain("dev");
    expect(container.textContent).toContain("running");
    expect(container.querySelector('[data-testid="tasks-history"]')).toBeTruthy();
  });

  it("clicking Run calls tasks.run with the script name", async () => {
    const { api } = createTasksMock(sampleTasks);
    const { container } = await renderPanel(api);
    const row = container.querySelector('[data-task-name="test"]') as HTMLElement;
    const button = row.querySelector('[data-testid="task-run-btn"]') as HTMLButtonElement;
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(api.run).toHaveBeenCalledTimes(1);
    expect(api.run).toHaveBeenCalledWith("test");
  });

  it("clicking Stop calls tasks.stop with the active run id", async () => {
    const { api, runListeners } = createTasksMock(sampleTasks);
    const { container } = await renderPanel(api);
    act(() => {
      runListeners[0]?.(running("dev"));
    });
    const row = container.querySelector('[data-task-name="dev"]') as HTMLElement;
    const button = row.querySelector('[data-testid="task-stop-btn"]') as HTMLButtonElement;
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(api.stop).toHaveBeenCalledWith("run-dev");
  });

  it("unsubscribes on unmount", async () => {
    const { api, unsubscribeRun, unsubscribeOutput } = createTasksMock(sampleTasks);
    const { unmount } = await renderPanel(api);
    unmount();
    mounted = undefined;
    expect(unsubscribeRun).toHaveBeenCalledTimes(1);
    expect(unsubscribeOutput).toHaveBeenCalledTimes(1);
  });
});
