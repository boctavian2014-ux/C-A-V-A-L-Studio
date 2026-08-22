import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInvoke, mockOn, mockRemoveListener } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockOn: vi.fn(),
  mockRemoveListener: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcRenderer: {
    invoke: mockInvoke,
    on: mockOn,
    removeListener: mockRemoveListener,
  },
}));

import { problemsApi } from "../../src/main/preload-problems";
import { PROBLEMS_CHANNELS } from "../../src/shared/problems-ipc-channels";

describe("preload-problems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes problems:get without a file filter", async () => {
    mockInvoke.mockResolvedValue([]);
    await problemsApi.getProblems();
    expect(mockInvoke).toHaveBeenCalledWith(PROBLEMS_CHANNELS.getProblems, undefined);
  });

  it("invokes problems:get with a relative file", async () => {
    mockInvoke.mockResolvedValue([]);
    await problemsApi.getProblems("src/app.ts");
    expect(mockInvoke).toHaveBeenCalledWith(PROBLEMS_CHANNELS.getProblems, "src/app.ts");
  });

  it("rejects path traversal before IPC", async () => {
    await expect(problemsApi.getProblems("../evil.ts")).rejects.toThrow(TypeError);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("invokes refresh and summary without a cwd payload", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await problemsApi.refresh();
    await problemsApi.getSummary();
    expect(mockInvoke).toHaveBeenCalledWith(PROBLEMS_CHANNELS.refresh);
    expect(mockInvoke).toHaveBeenCalledWith(PROBLEMS_CHANNELS.getSummary);
  });

  it("onProblemsChanged registers a listener that strips the event", () => {
    const cb = vi.fn();
    const cleanup = problemsApi.onProblemsChanged(cb);
    expect(mockOn).toHaveBeenCalledWith(PROBLEMS_CHANNELS.problemsChanged, expect.any(Function));
    const listener = mockOn.mock.calls[0]?.[1] as (event: unknown, payload: unknown) => void;
    listener({ sender: {} }, [{ file: "src/app.ts" }]);
    expect(cb).toHaveBeenCalledWith([{ file: "src/app.ts" }]);
    cleanup();
    expect(mockRemoveListener).toHaveBeenCalledWith(
      PROBLEMS_CHANNELS.problemsChanged,
      expect.any(Function)
    );
  });
});
