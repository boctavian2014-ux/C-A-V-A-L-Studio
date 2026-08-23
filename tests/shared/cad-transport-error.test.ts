import { describe, expect, it } from "vitest";

import { NetworkGuardError } from "../../src/main/network-guard";
import {
  cadTransportErrorMessage,
  containsCadTransportLeak,
  mapCadHttpFailure,
  mapCadTransportError,
} from "../../src/shared/cad-transport-error";

const HOST = "c-a-v-a-l-studio-production.up.railway.app";

function assertNoLeak(text: string) {
  expect(containsCadTransportLeak(text, HOST)).toBe(false);
  expect(text).not.toMatch(/https?:\/\//i);
  expect(text).not.toContain("railway.app");
  expect(text).not.toContain(HOST);
}

describe("mapCadHttpFailure", () => {
  it("maps status codes without upstream text", () => {
    assertNoLeak(mapCadHttpFailure(401));
    assertNoLeak(mapCadHttpFailure(404, "cancel"));
    assertNoLeak(mapCadHttpFailure(503, "plan"));
    expect(mapCadHttpFailure(503)).toContain("temporarily unavailable");
    expect(mapCadHttpFailure(404, "logs")).toContain("logs");
  });

  it("never echoes planted upstream error strings", () => {
    const planted = `Internal error at https://${HOST}/cad/jobs`;
    const mapped = mapCadHttpFailure(500, "job");
    expect(mapped).not.toContain(planted);
    assertNoLeak(mapped);
  });
});

describe("cadTransportErrorMessage", () => {
  it("maps timeout without transport URL", () => {
    const msg = cadTransportErrorMessage(
      new NetworkGuardError("timeout", "request timed out", `https://${HOST}/health`)
    );
    assertNoLeak(msg);
    expect(msg).toContain("timed out");
  });

  it("maps DNS/connection guard blocks without host details", () => {
    const msg = cadTransportErrorMessage(
      new NetworkGuardError("dns", "dns lookup blocked", `https://${HOST}/cad/jobs`)
    );
    assertNoLeak(msg);
    expect(msg).toContain("security policy");
  });

  it("maps SSRF host rejection without hostname", () => {
    const msg = cadTransportErrorMessage(
      new NetworkGuardError("host", "host not allowed", "https://evil.example/cad/jobs")
    );
    assertNoLeak(msg);
    expect(msg).toContain("security policy");
  });

  it("maps invalid JSON without parse details", () => {
    const msg = cadTransportErrorMessage(new SyntaxError("Unexpected token at pos 12"));
    assertNoLeak(msg);
    expect(msg).toContain("invalid response");
  });

  it("maps generic fetch failures without error.message passthrough", () => {
    const msg = cadTransportErrorMessage(new TypeError("fetch failed"));
    assertNoLeak(msg);
    expect(msg).not.toContain("fetch failed");
    expect(msg).toContain("unreachable");
  });

  it("uses cloud-only unreachable copy when cloudOnly is true", () => {
    expect(cadTransportErrorMessage(new TypeError("fetch failed"), { cloudOnly: true })).toContain(
      "CAD cloud service"
    );
  });

  it("uses local fallback copy when cloudOnly is false", () => {
    expect(cadTransportErrorMessage(new TypeError("fetch failed"), { cloudOnly: false })).toContain(
      "npm run cad:serve"
    );
  });
});

describe("mapCadTransportError", () => {
  it("returns ok:false with sanitized error", () => {
    const result = mapCadTransportError(
      new NetworkGuardError("timeout", "request timed out", `https://${HOST}/health`),
      { cloudOnly: true }
    );
    expect(result).toEqual({ ok: false, error: expect.any(String) });
    assertNoLeak(result.error);
  });
});

describe("containsCadTransportLeak", () => {
  it("detects URLs, railway hosts, and configured hostname", () => {
    expect(containsCadTransportLeak("see https://example.com")).toBe(true);
    expect(containsCadTransportLeak("up.railway.app")).toBe(true);
    expect(containsCadTransportLeak(`host ${HOST}`, HOST)).toBe(true);
    expect(containsCadTransportLeak("CAD service is unreachable.")).toBe(false);
  });
});
