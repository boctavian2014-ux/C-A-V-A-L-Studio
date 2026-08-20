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

import { tasksApi } from "../../src/main/preload-tasks";
import { TASKS_CHANNELS } from "../../src/shared/tasks-ipc-channels";

describe("preload-tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes list and getRuns without a cwd payload", async () => {
    mockInvoke.mockResolvedValue([]);
    await tasksApi.list();
    await tasksApi.getRuns();
    expect(mockInvoke).toHaveBeenCalledWith(TASKS_CHANNELS.list);
    expect(mockInvoke).toHaveBeenCalledWith(TASKS_CHANNELS.getRuns);
  });

  it("invokes run with a validated task name", async () => {
    mockInvoke.mockResolvedValue({ id: "1" });
    await tasksApi.run("test");
    expect(mockInvoke).toHaveBeenCalledWith(TASKS_CHANNELS.run, "test");
  });

  it("rejects invalid task names before IPC", async () => {
    await expect(tasksApi.run("../evil")).rejects.toThrow(TypeError);
    await expect(tasksApi.run("")).rejects.toThrow(TypeError);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("rejects invalid run ids before IPC", async () => {
    await expect(tasksApi.stop("a\\b")).rejects.toThrow(TypeError);
    await expect(tasksApi.getRun("../x")).rejects.toThrow(TypeError);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("onRunChanged registers a listener that strips the event", () => {
    const cb = vi.fn();
    const cleanup = tasksApi.onRunChanged(cb);
    expect(mockOn).toHaveBeenCalledWith(TASKS_CHANNELS.runChanged, expect.any(Function));
    const listener = mockOn.mock.calls[0]?.[1] as (event: unknown, payload: unknown) => void;
    listener({ sender: {} }, { id: "run-1", status: "running" });
    expect(cb).toHaveBeenCalledWith({ id: "run-1", status: "running" });
    cleanup();
    expect(mockRemoveListener).toHaveBeenCalledWith(
      TASKS_CHANNELS.runChanged,
      expect.any(Function)
    );
  });

  it("onOutput registers a listener that strips the event", () => {
    const cb = vi.fn();
    const cleanup = tasksApi.onOutput(cb);
    expect(mockOn).toHaveBeenCalledWith(TASKS_CHANNELS.output, expect.any(Function));
    const listener = mockOn.mock.calls[0]?.[1] as (event: unknown, payload: unknown) => void;
    listener({ sender: {} }, { runId: "1", taskName: "test", data: "ok" });
    expect(cb).toHaveBeenCalledWith({ runId: "1", taskName: "test", data: "ok" });
    cleanup();
    expect(mockRemoveListener).toHaveBeenCalledWith(TASKS_CHANNELS.output, expect.any(Function));
  });
});
