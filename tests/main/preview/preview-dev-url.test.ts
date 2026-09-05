import { describe, expect, it } from "vitest";

import {
  extractDevServerUrlFromLog,
  normalizePreviewLoopbackUrl,
} from "../../../src/shared/preview-dev-url";

describe("preview-dev-url", () => {
  it("parses Vite Local URLs including dynamic ports", () => {
    expect(
      extractDevServerUrlFromLog("  Local: http://localhost:5173/\n")
    ).toBe("http://localhost:5173");
    expect(
      extractDevServerUrlFromLog("  Local: http://localhost:5177/\n")
    ).toBe("http://localhost:5177");
  });

  it("parses Next ready server lines", () => {
    expect(
      extractDevServerUrlFromLog("ready - started server on 0.0.0.0:3000, url: http://localhost:3000")
    ).toBe("http://localhost:3000");
  });

  it("rewrites 0.0.0.0 to 127.0.0.1 and keeps localhost", () => {
    expect(normalizePreviewLoopbackUrl("http://localhost:5173/")).toBe("http://localhost:5173/");
    expect(normalizePreviewLoopbackUrl("http://0.0.0.0:5173/")).toBe("http://127.0.0.1:5173/");
    expect(() => normalizePreviewLoopbackUrl("http://example.com:5173/")).toThrow(
      /loopback/i
    );
  });

  it("prefers the last URL match in a chunk", () => {
    const chunk = [
      "Local: http://localhost:5173/",
      "Local: http://localhost:5177/",
    ].join("\n");
    expect(extractDevServerUrlFromLog(chunk)).toBe("http://localhost:5177");
  });
});
