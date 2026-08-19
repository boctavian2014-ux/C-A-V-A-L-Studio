import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, on, removeListener } = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcRenderer: {
    invoke,
    on,
    removeListener,
  },
}));

import { PREVIEW_CHANNELS } from "../../src/shared/preview-ipc-channels";
import { assertPreviewTarget, previewApi } from "../../src/main/preload-preview";
import type { PreviewLogLine, PreviewState } from "../../src/shared/preview-contract";

describe("preload-preview", () => {
  beforeEach(() => {
    invoke.mockReset();
    on.mockReset();
    removeListener.mockReset();
    invoke.mockResolvedValue({
      target: "web",
      status: "stopped",
      url: null,
      pid: null,
      startedAt: null,
      lastError: null,
    } satisfies PreviewState);
  });

  it("assertPreviewTarget rejects invalid targets", () => {
    for (const bad of ["desktop", 123, null, undefined] as unknown[]) {
      expect(() => assertPreviewTarget(bad as "web")).toThrow(TypeError);
      expect(() => assertPreviewTarget(bad as "web")).toThrow(/Invalid preview target/i);
    }
  });

  it("start('web') invokes the exact preview:start channel with web", async () => {
    await previewApi.start("web");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(PREVIEW_CHANNELS.start, "web");
  });

  it("getState, stop, restart, and getLogs invoke their dedicated channels", async () => {
    await previewApi.getState("mobile");
    await previewApi.stop("mobile");
    await previewApi.restart("mobile");
    await previewApi.getLogs("mobile");

    expect(invoke).toHaveBeenNthCalledWith(1, PREVIEW_CHANNELS.getState, "mobile");
    expect(invoke).toHaveBeenNthCalledWith(2, PREVIEW_CHANNELS.stop, "mobile");
    expect(invoke).toHaveBeenNthCalledWith(3, PREVIEW_CHANNELS.restart, "mobile");
    expect(invoke).toHaveBeenNthCalledWith(4, PREVIEW_CHANNELS.getLogs, "mobile");
  });

  it("openUrl invokes preview:open-url with the target", async () => {
    invoke.mockResolvedValue(undefined);
    await previewApi.openUrl("web");
    expect(invoke).toHaveBeenCalledWith(PREVIEW_CHANNELS.openUrl, "web");
  });

  it("openConfig invokes preview:open-config without extra payload", async () => {
    invoke.mockResolvedValue(undefined);
    await previewApi.openConfig();
    expect(invoke).toHaveBeenCalledWith(PREVIEW_CHANNELS.openConfig);
  });

  it("onStateChange registers listener on the correct channel and unsubscribes with same reference", () => {
    const cb = vi.fn();
    const unsubscribe = previewApi.onStateChange(cb);

    expect(on).toHaveBeenCalledTimes(1);
    expect(on.mock.calls[0]?.[0]).toBe(PREVIEW_CHANNELS.stateChanged);
    const listener = on.mock.calls[0]?.[1] as (
      event: Electron.IpcRendererEvent,
      state: PreviewState
    ) => void;

    const mockEvent = { sender: { send: vi.fn() } } as unknown as Electron.IpcRendererEvent;
    const state: PreviewState = {
      target: "web",
      status: "running",
      url: "http://127.0.0.1:5173",
      pid: 42,
      startedAt: 1,
      lastError: null,
    };
    listener(mockEvent, state);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]).toEqual([state]);
    expect(cb.mock.calls[0]?.length).toBe(1);

    unsubscribe();
    expect(removeListener).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith(PREVIEW_CHANNELS.stateChanged, listener);
  });

  it("onLog delivers only the log line payload to the callback", () => {
    const cb = vi.fn();
    const unsubscribe = previewApi.onLog(cb);

    const listener = on.mock.calls[0]?.[1] as (
      event: Electron.IpcRendererEvent,
      line: PreviewLogLine
    ) => void;
    const mockEvent = { sender: { send: vi.fn() } } as unknown as Electron.IpcRendererEvent;
    const line: PreviewLogLine = {
      target: "mobile",
      stream: "stdout",
      line: "Metro waiting on exp://127.0.0.1:8081",
      timestamp: 123,
    };
    listener(mockEvent, line);

    expect(cb.mock.calls[0]).toEqual([line]);
    expect(cb.mock.calls[0]?.length).toBe(1);

    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith(PREVIEW_CHANNELS.logLine, listener);
  });

  it("rejects invalid targets before ipcRenderer.invoke", async () => {
    await expect(previewApi.start("desktop" as "web")).rejects.toThrow(TypeError);
    expect(invoke).not.toHaveBeenCalled();
  });
});
