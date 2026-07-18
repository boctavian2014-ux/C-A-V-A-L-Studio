import { describe, expect, it } from "vitest";

import {
  CAVALLO_CSP,
  CAVALLO_RENDERER_WEB_PREFERENCES_BASE,
} from "../../src/main/renderer-security";

describe("electron security config", () => {
  it("uses hardened renderer webPreferences", () => {
    expect(CAVALLO_RENDERER_WEB_PREFERENCES_BASE.contextIsolation).toBe(true);
    expect(CAVALLO_RENDERER_WEB_PREFERENCES_BASE.nodeIntegration).toBe(false);
    expect(CAVALLO_RENDERER_WEB_PREFERENCES_BASE.sandbox).toBe(true);
  });

  it("defines CSP without unsafe-eval and with Monaco worker-src", () => {
    expect(CAVALLO_CSP).toContain("default-src 'self'");
    expect(CAVALLO_CSP).toContain("script-src 'self'");
    expect(CAVALLO_CSP).not.toContain("unsafe-eval");
    expect(CAVALLO_CSP).toContain("worker-src 'self' blob:");
    expect(CAVALLO_CSP).toContain("connect-src 'self' https: wss:");
  });
});
