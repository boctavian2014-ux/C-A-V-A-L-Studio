import { afterEach, describe, expect, it, vi } from "vitest";

import {
  logRuntimeVersions,
  shutdownMark,
} from "../../src/main/shutdown-diagnostics";

describe("shutdown diagnostics markers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints an ISO timestamp and phase", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    shutdownMark("before-quit");
    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0]?.[0]);
    expect(line).toMatch(
      /^\[shutdown\] \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z before-quit$/
    );
  });

  it("appends JSON extra fields", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    shutdownMark("sqlite-close", { path: "C:\\tmp\\history.db" });
    const line = String(info.mock.calls[0]?.[0]);
    expect(line).toContain("[shutdown]");
    expect(line).toContain("sqlite-close");
    expect(line).toContain("history.db");
  });

  it("logs Electron/Node ABI at runtime", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logRuntimeVersions();
    const line = String(info.mock.calls[0]?.[0]);
    expect(line).toContain("[shutdown]");
    expect(line).toContain("runtime");
    expect(line).toContain('"modules"');
    expect(line).toContain('"node"');
  });
});
