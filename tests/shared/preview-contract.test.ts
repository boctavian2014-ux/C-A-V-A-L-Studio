import { describe, expect, it } from "vitest";

import {
  idlePreviewState,
  isPreviewTarget,
  parsePreviewTarget,
  type PreviewApi,
  type PreviewLogLine,
  type PreviewState,
} from "../../src/shared/preview-contract";
import { PREVIEW_CHANNELS } from "../../src/shared/preview-ipc-channels";

describe("preview-contract", () => {
  it("accepts only web or mobile targets", () => {
    expect(parsePreviewTarget("web")).toBe("web");
    expect(parsePreviewTarget("mobile")).toBe("mobile");
    expect(isPreviewTarget("web")).toBe(true);
    expect(isPreviewTarget("mobile")).toBe(true);
    expect(isPreviewTarget("desktop")).toBe(false);
    expect(() => parsePreviewTarget("desktop")).toThrow(/Invalid preview target/i);
    expect(() => parsePreviewTarget({ target: "web" })).toThrow(/Invalid preview target/i);
  });

  it("idlePreviewState defaults to not-configured", () => {
    expect(idlePreviewState("web")).toEqual({
      target: "web",
      status: "not-configured",
      url: null,
      pid: null,
      startedAt: null,
      lastError: null,
    });
  });

  it("defines stable preview IPC channel names", () => {
    expect(PREVIEW_CHANNELS).toEqual({
      getState: "preview:get-state",
      start: "preview:start",
      stop: "preview:stop",
      restart: "preview:restart",
      getLogs: "preview:get-logs",
      openConfig: "preview:open-config",
      openUrl: "preview:open-url",
      stateChanged: "preview:state-changed",
      logLine: "preview:log-line",
    });
  });

  it("PreviewApi is structurally satisfied by a typed stub", async () => {
    const states = new Map<string, PreviewState>();
    const logs: PreviewLogLine[] = [];

    const api: PreviewApi = {
      getState: async (target) => states.get(target) ?? idlePreviewState(target),
      start: async (target) => {
        const next: PreviewState = {
          target,
          status: "starting",
          url: null,
          pid: 100,
          startedAt: Date.now(),
          lastError: null,
        };
        states.set(target, next);
        return next;
      },
      stop: async (target) => {
        const next: PreviewState = {
          target,
          status: "stopped",
          url: null,
          pid: null,
          startedAt: null,
          lastError: null,
        };
        states.set(target, next);
        return next;
      },
      restart: async (target) => {
        await api.stop(target);
        return api.start(target);
      },
      getLogs: async (target) => logs.filter((line) => line.target === target),
      openConfig: async () => undefined,
      openUrl: async () => undefined,
      onStateChange: () => () => undefined,
      onLog: () => () => undefined,
    };

    const started = await api.start("web");
    expect(started.status).toBe("starting");
    expect((await api.getState("web")).pid).toBe(100);
    await api.restart("web");
    expect((await api.getState("web")).status).toBe("starting");
    await api.stop("mobile");
    expect((await api.getState("mobile")).status).toBe("stopped");
    expect(await api.getLogs("web")).toEqual([]);
    await expect(api.openConfig()).resolves.toBeUndefined();
  });
});
