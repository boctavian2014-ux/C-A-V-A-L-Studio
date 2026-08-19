/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GitPanel } from "../../../../src/renderer/components/git/GitPanel";
import { useGitStore } from "../../../../src/renderer/store/git-store";
import type {
  GitApi,
  GitDiffResult,
  GitOperationState,
  GitStatus,
} from "../../../../src/shared/git-contract";

function sampleStatus(overrides: Partial<GitStatus> = {}): GitStatus {
  return {
    branch: "main",
    ahead: 1,
    behind: 0,
    files: [
      { path: "src/app.ts", status: "modified", staged: false },
      { path: "README.md", status: "added", staged: true },
    ],
    hasConflicts: false,
    isClean: false,
    ...overrides,
  };
}

function createGitMock(status: GitStatus = sampleStatus()) {
  const statusListeners: Array<(next: GitStatus) => void> = [];
  const operationListeners: Array<(next: GitOperationState) => void> = [];
  const unsubscribeStatus = vi.fn();
  const unsubscribeOperation = vi.fn();

  const api: GitApi = {
    status: vi.fn(async () => status),
    stage: vi.fn(async () => undefined),
    unstage: vi.fn(async () => undefined),
    discardChanges: vi.fn(async () => undefined),
    commit: vi.fn(async (input) => ({ hash: "abc1234", message: input.message })),
    branches: vi.fn(async () => [{ name: "main", current: true, remote: "origin/main", ahead: 1, behind: 0 }]),
    checkout: vi.fn(async () => undefined),
    createBranch: vi.fn(async () => undefined),
    diff: vi.fn(async (file, staged) => ({
      path: file ?? "",
      diff: `diff --git a/${file} b/${file}\n+typed ${staged ? "staged" : "worktree"}`,
      binary: false,
    } satisfies GitDiffResult)),
    log: vi.fn(async () => []),
    onStatusChange: vi.fn((cb) => {
      statusListeners.push(cb);
      return unsubscribeStatus;
    }),
    onOperationChange: vi.fn((cb) => {
      operationListeners.push(cb);
      return unsubscribeOperation;
    }),
  };

  return { api, statusListeners, operationListeners, unsubscribeStatus, unsubscribeOperation };
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

function setTextareaValue(element: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(element, value);
  act(() => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("GitPanel typed API", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    useGitStore.getState().resetForTests();
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    useGitStore.getState().resetForTests();
    vi.restoreAllMocks();
  });

  async function renderPanel(api: GitApi) {
    window.caval = { git: api } as Window["caval"];
    const result = mount(<GitPanel />);
    mounted = result;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    return result;
  }

  it("calls status() on mount without a projectPath", async () => {
    const { api } = createGitMock();
    await renderPanel(api);
    expect(api.status).toHaveBeenCalledTimes(1);
    expect(api.status).toHaveBeenCalledWith();
    expect(api.status.mock.calls[0]?.length).toBe(0);
  });

  it("unsubscribes onStatusChange and onOperationChange on unmount", async () => {
    const { api, unsubscribeStatus, unsubscribeOperation } = createGitMock();
    const { unmount } = await renderPanel(api);
    expect(api.onStatusChange).toHaveBeenCalledTimes(1);
    expect(api.onOperationChange).toHaveBeenCalledTimes(1);
    unmount();
    mounted = undefined;
    expect(unsubscribeStatus).toHaveBeenCalledTimes(1);
    expect(unsubscribeOperation).toHaveBeenCalledTimes(1);
  });

  it("stage/unstage send a relative path array", async () => {
    const { api } = createGitMock();
    const { container } = await renderPanel(api);

    const stageBtn = container.querySelector('[data-testid="git-stage"]') as HTMLButtonElement | null;
    expect(stageBtn).toBeTruthy();
    act(() => {
      stageBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.stage).toHaveBeenCalledWith(["src/app.ts"]);

    const unstageBtn = container.querySelector('[data-testid="git-unstage"]') as HTMLButtonElement | null;
    expect(unstageBtn).toBeTruthy();
    act(() => {
      unstageBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.unstage).toHaveBeenCalledWith(["README.md"]);
  });

  it("commit sends only { message }", async () => {
    const { api } = createGitMock();
    const { container } = await renderPanel(api);
    const textarea = container.querySelector('[data-testid="git-commit-message"]') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    setTextareaValue(textarea, "fix: typed commit");
    const commitBtn = container.querySelector('[data-testid="git-commit"]') as HTMLButtonElement;
    expect(commitBtn.disabled).toBe(false);
    act(() => {
      commitBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.commit).toHaveBeenCalledTimes(1);
    expect(api.commit).toHaveBeenCalledWith({ message: "fix: typed commit" });
    expect(api.commit.mock.calls[0]?.length).toBe(1);
    expect(api.commit.mock.calls[0]?.[0]).not.toHaveProperty("files");
  });

  it("disables commit without a message or staged files", async () => {
    const { api } = createGitMock(
      sampleStatus({
        files: [{ path: "src/app.ts", status: "modified", staged: false }],
      })
    );
    const { container } = await renderPanel(api);
    const commitBtn = container.querySelector('[data-testid="git-commit"]') as HTMLButtonElement;
    expect(commitBtn.disabled).toBe(true);

    const textarea = container.querySelector('[data-testid="git-commit-message"]') as HTMLTextAreaElement;
    setTextareaValue(textarea, "has message but nothing staged");
    expect(commitBtn.disabled).toBe(true);

    const { api: stagedApi } = createGitMock();
    mounted?.unmount();
    useGitStore.getState().resetForTests();
    const second = await renderPanel(stagedApi);
    mounted = second;
    const stagedCommit = second.container.querySelector('[data-testid="git-commit"]') as HTMLButtonElement;
    expect(stagedCommit.disabled).toBe(true);
  });

  it("selecting a file calls diff(path, staged)", async () => {
    const { api } = createGitMock();
    const { container } = await renderPanel(api);
    const unstaged = container.querySelector('[data-testid="git-file"][data-path="src/app.ts"]');
    act(() => {
      unstaged?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.diff).toHaveBeenCalledWith("src/app.ts", false);

    const toggleStaged = container.querySelector('[data-testid="git-diff-staged"]');
    act(() => {
      toggleStaged?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.diff).toHaveBeenCalledWith("src/app.ts", true);
  });

  it("disables the relevant action and shows feedback while an operation is running", async () => {
    const { api, operationListeners } = createGitMock();
    const { container } = await renderPanel(api);
    act(() => {
      operationListeners[0]?.({
        operation: "stage",
        status: "running",
        error: null,
        timestamp: Date.now(),
      });
    });
    expect(container.textContent).toContain("Staging…");
    const stageBtn = container.querySelector('[data-testid="git-stage"]') as HTMLButtonElement | null;
    expect(stageBtn?.disabled).toBe(true);

    act(() => {
      operationListeners[0]?.({
        operation: "commit",
        status: "running",
        error: null,
        timestamp: Date.now(),
      });
    });
    expect(container.textContent).toContain("Committing…");
    const commitBtn = container.querySelector('[data-testid="git-commit"]') as HTMLButtonElement;
    expect(commitBtn.disabled).toBe(true);
  });

  it("surfaces a Git error as an accessible alert", async () => {
    const { api } = createGitMock();
    api.status = vi.fn(async () => {
      throw new Error("Deschide un folder în workspace înainte de operații Git.");
    });
    const { container } = await renderPanel(api);
    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.getAttribute("role")).toBe("alert");
    expect(alert?.textContent).toMatch(/Deschide un folder/i);
  });
});
