/**
 * Lot C1 — SSRF hardening tests (no real network).
 * All DNS + fetch are mocked / local in-process.
 */
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NETWORK_GUARD_DEFAULTS,
  NetworkGuardError,
  assertSafeOutboundUrl,
  hostMatchesAllowlist,
  isBlockedIpAddress,
  safeFetch,
  sanitizeNetworkError,
  validateCadApiUrl,
} from "../../src/main/network-guard";

const ALLOW = ["c-a-v-a-l-studio-production.up.railway.app", "up.railway.app", "assets.meshy.ai"];

const publicLookup = async (): Promise<string[]> => ["93.184.216.34"]; // example.com public

function mockResponse(init: {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Buffer;
  location?: string;
}): Response {
  const headers = new Headers(init.headers ?? {});
  if (init.location) headers.set("location", init.location);
  const body = init.body ?? "solid ok";
  return new Response(body, { status: init.status ?? 200, headers });
}

describe("Lot C1 — network-guard unit", () => {
  const prevCloud = process.env.CAD_CLOUD_ONLY;
  const prevCadUrl = process.env.CAD_API_URL;

  beforeEach(() => {
    process.env.CAD_CLOUD_ONLY = "1";
    process.env.CAD_API_URL = "https://c-a-v-a-l-studio-production.up.railway.app";
  });

  afterEach(() => {
    process.env.CAD_CLOUD_ONLY = prevCloud;
    process.env.CAD_API_URL = prevCadUrl;
  });

  it("isBlockedIpAddress covers loopback, RFC1918, link-local, metadata", () => {
    expect(isBlockedIpAddress("127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("127.1.2.3")).toBe(true);
    expect(isBlockedIpAddress("10.0.0.5")).toBe(true);
    expect(isBlockedIpAddress("192.168.1.1")).toBe(true);
    expect(isBlockedIpAddress("172.16.0.1")).toBe(true);
    expect(isBlockedIpAddress("169.254.169.254")).toBe(true);
    expect(isBlockedIpAddress("169.254.1.1")).toBe(true);
    expect(isBlockedIpAddress("::1")).toBe(true);
    expect(isBlockedIpAddress("fe80::1")).toBe(true);
    expect(isBlockedIpAddress("fc00::1")).toBe(true);
    expect(isBlockedIpAddress("93.184.216.34")).toBe(false);
  });

  it("hostMatchesAllowlist supports exact and suffix", () => {
    expect(hostMatchesAllowlist("up.railway.app", ALLOW)).toBe(true);
    expect(
      hostMatchesAllowlist("c-a-v-a-l-studio-production.up.railway.app", ALLOW)
    ).toBe(true);
    expect(hostMatchesAllowlist("evil.com", ALLOW)).toBe(false);
  });

  it("rejects http:// URLs for outbound/artifact", async () => {
    await expect(
      assertSafeOutboundUrl("http://c-a-v-a-l-studio-production.up.railway.app/x", {
        mode: "outbound",
        allowedHosts: ALLOW,
        lookup: publicLookup,
      })
    ).rejects.toMatchObject({ reason: "scheme" });
  });

  it("rejects file/ftp/data/javascript schemes", async () => {
    for (const url of [
      "file:///etc/passwd",
      "ftp://c-a-v-a-l-studio-production.up.railway.app/x",
      "data:text/plain,hi",
      "javascript:alert(1)",
    ]) {
      await expect(
        assertSafeOutboundUrl(url, { mode: "outbound", allowedHosts: ALLOW, lookup: publicLookup })
      ).rejects.toMatchObject({ reason: "scheme" });
    }
  });

  it("rejects 127.0.0.1 / localhost / metadata / private as literal hosts", async () => {
    // Even if attacker somehow allowlists these, private IP literals must still fail.
    const hostsWithPrivates = [...ALLOW, "127.0.0.1", "localhost", "169.254.169.254", "10.0.0.5"];
    for (const url of [
      "https://127.0.0.1/stl",
      "https://localhost/stl",
      "https://169.254.169.254/latest/meta-data/",
      "https://10.0.0.5/stl",
    ]) {
      await expect(
        assertSafeOutboundUrl(url, {
          mode: "outbound",
          allowedHosts: hostsWithPrivates,
          lookup: async (hostname) => {
            if (hostname === "localhost") return ["127.0.0.1"];
            return [hostname];
          },
        })
      ).rejects.toMatchObject({ reason: "private_ip" });
    }
  });

  it("rejects host outside allowlist", async () => {
    await expect(
      assertSafeOutboundUrl("https://evil.example/stl", {
        mode: "cad-artifact",
        allowedHosts: ALLOW,
        lookup: publicLookup,
      })
    ).rejects.toMatchObject({ reason: "host" });
  });

  it("rejects DNS that resolves to private IP", async () => {
    await expect(
      assertSafeOutboundUrl("https://c-a-v-a-l-studio-production.up.railway.app/stl", {
        mode: "cad-artifact",
        allowedHosts: ALLOW,
        lookup: async () => ["10.0.0.5"],
      })
    ).rejects.toMatchObject({ reason: "private_ip" });
  });

  it("allows valid allowlisted https host with public DNS", async () => {
    const parsed = await assertSafeOutboundUrl(
      "https://c-a-v-a-l-studio-production.up.railway.app/cad/jobs/1/result",
      { mode: "cad-artifact", allowedHosts: ALLOW, lookup: publicLookup }
    );
    expect(parsed.hostname).toContain("railway.app");
  });

  it("cad-base local http loopback allowed only when not cloud-only", async () => {
    process.env.CAD_CLOUD_ONLY = "0";
    const parsed = await assertSafeOutboundUrl("http://127.0.0.1:8791", {
      mode: "cad-base",
      lookup: async () => ["127.0.0.1"],
    });
    expect(parsed.hostname).toBe("127.0.0.1");

    process.env.CAD_CLOUD_ONLY = "1";
    await expect(
      assertSafeOutboundUrl("http://127.0.0.1:8791", {
        mode: "cad-base",
        lookup: async () => ["127.0.0.1"],
      })
    ).rejects.toMatchObject({ reason: "scheme" });
  });

  it("validateCadApiUrl rejects attacker hosts", async () => {
    const result = await validateCadApiUrl("https://attacker.example", {
      lookup: publicLookup,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("host");
  });
});

describe("Lot C1 — safeFetch redirects / size / timeout / secrets", () => {
  const allowHosts = ["good.example", "up.railway.app"];

  it("rejects redirect to private IP at second stage", async () => {
    // Target host is allowlisted so rejection must come from DNS→private IP, not host list.
    const hosts = ["good.example", "evil-internal.example"];
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.includes("good.example/stl") && !href.includes("evil")) {
        return mockResponse({ status: 302, location: "https://evil-internal.example/stl" });
      }
      return mockResponse({ status: 200, body: "stolen" });
    });

    const lookup = async (hostname: string): Promise<string[]> => {
      if (hostname === "good.example") return ["93.184.216.34"];
      if (hostname === "evil-internal.example") return ["169.254.169.254"];
      return ["93.184.216.34"];
    };

    await expect(
      safeFetch("https://good.example/stl", {
        mode: "outbound",
        allowedHosts: hosts,
        lookup,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        maxBytes: 1024,
        allowedContentTypes: null,
      })
    ).rejects.toMatchObject({ reason: "private_ip" });
  });

  it("rejects >3 redirects", async () => {
    let hop = 0;
    const fetchImpl = vi.fn(async () => {
      hop += 1;
      return mockResponse({
        status: 302,
        location: `https://good.example/r${hop}`,
      });
    });

    await expect(
      safeFetch("https://good.example/start", {
        mode: "outbound",
        allowedHosts: allowHosts,
        lookup: publicLookup,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        maxRedirects: 3,
        maxBytes: 1024,
        allowedContentTypes: null,
      })
    ).rejects.toMatchObject({ reason: "redirect_limit" });
  });

  it("aborts when response exceeds size limit", async () => {
    const big = Buffer.alloc(64 * 1024, 0x41);
    const fetchImpl = vi.fn(async () =>
      mockResponse({
        status: 200,
        headers: { "content-type": "application/octet-stream" },
        body: big,
      })
    );

    await expect(
      safeFetch("https://good.example/stl", {
        mode: "outbound",
        allowedHosts: allowHosts,
        lookup: publicLookup,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        maxBytes: 1024,
        allowedContentTypes: null,
      })
    ).rejects.toMatchObject({ reason: "size" });
  });

  it("aborts on timeout and reports timeout reason", async () => {
    const fetchImpl = vi.fn(
      (_url: string | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal) {
            signal.addEventListener("abort", () => {
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            });
          }
        })
    );

    await expect(
      safeFetch("https://good.example/stl", {
        mode: "outbound",
        allowedHosts: allowHosts,
        lookup: publicLookup,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 50,
        maxBytes: 1024,
        allowedContentTypes: null,
      })
    ).rejects.toMatchObject({ reason: "timeout" });
  });

  it("success path: allowlisted URL, no redirect", async () => {
    const stl = Buffer.from("solid test\nendsolid\n");
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      // Must NOT receive CAD API key on free URL even if caller passed cadAuthHeaders
      // without matching trustedCadOrigin.
      expect(JSON.stringify(headers ?? {})).not.toContain("super-secret-cad-key");
      return mockResponse({
        status: 200,
        headers: { "content-type": "model/stl" },
        body: stl,
      });
    });

    const result = await safeFetch("https://good.example/model.stl", {
      mode: "outbound",
      allowedHosts: allowHosts,
      lookup: publicLookup,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxBytes: NETWORK_GUARD_DEFAULTS.STL_MAX_BYTES,
      allowedContentTypes: ["model/stl", "application/octet-stream"],
      trustedCadOrigin: "https://c-a-v-a-l-studio-production.up.railway.app",
      cadAuthHeaders: { "x-cad-api-key": "super-secret-cad-key" },
    });

    expect(result.ok).toBe(true);
    expect(result.buffer.equals(stl)).toBe(true);
    expect(result.status).toBe(200);
  });

  it("attaches CAD auth only when origin matches trusted CAD base", async () => {
    const seen: Array<Record<string, string> | undefined> = [];
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      seen.push(init?.headers as Record<string, string> | undefined);
      return mockResponse({
        status: 200,
        headers: { "content-type": "model/stl" },
        body: "solid ok\n",
      });
    });

    await safeFetch("https://good.example/cad/jobs/1/result", {
      mode: "outbound",
      allowedHosts: allowHosts,
      lookup: publicLookup,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      trustedCadOrigin: "https://good.example",
      cadAuthHeaders: { "x-cad-api-key": "super-secret-cad-key" },
      allowedContentTypes: null,
      maxBytes: 1024,
    });

    expect(seen[0]?.["x-cad-api-key"]).toBe("super-secret-cad-key");

    seen.length = 0;
    await safeFetch("https://good.example/other", {
      mode: "outbound",
      allowedHosts: allowHosts,
      lookup: publicLookup,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      trustedCadOrigin: "https://up.railway.app",
      cadAuthHeaders: { "x-cad-api-key": "super-secret-cad-key" },
      allowedContentTypes: null,
      maxBytes: 1024,
    });
    expect(seen[0]?.["x-cad-api-key"]).toBeUndefined();
  });

  it("sanitizeNetworkError never echoes API key material", () => {
    const err = new NetworkGuardError(
      "host",
      "Blocked — x-cad-api-key: super-secret-cad-key leaked",
      "https://evil.example/?token=abc"
    );
    const msg = sanitizeNetworkError(err);
    expect(msg).not.toContain("super-secret-cad-key");
    expect(msg.toLowerCase()).toMatch(/redacted|blocked/);
  });
});

describe("Lot C1 — local mock HTTP server (functional regression)", () => {
  let server: Server;
  let baseUrl: string;
  const prevCloud = process.env.CAD_CLOUD_ONLY;

  beforeEach(async () => {
    process.env.CAD_CLOUD_ONLY = "0";
    server = createServer((req, res) => {
      if (req.url === "/ok.stl") {
        res.writeHead(200, { "content-type": "model/stl" });
        res.end("solid ok\nendsolid\n");
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    process.env.CAD_CLOUD_ONLY = prevCloud;
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  });

  it("allows local CAD base artifact fetch when CAD_CLOUD_ONLY=0", async () => {
    const result = await safeFetch(`${baseUrl}/ok.stl`, {
      mode: "cad-artifact",
      cadBaseUrl: baseUrl,
      lookup: async () => ["127.0.0.1"],
      maxBytes: 4096,
      allowedContentTypes: ["model/stl", "application/octet-stream"],
      trustedCadOrigin: baseUrl,
      cadAuthHeaders: { "x-cad-api-key": "local-test-key" },
    });
    expect(result.ok).toBe(true);
    expect(result.buffer.toString("utf8")).toContain("solid ok");
    // Error path sanitization: ensure key not in sanitize helper
    expect(sanitizeNetworkError(new Error("x-cad-api-key: local-test-key"))).not.toContain(
      "local-test-key"
    );
  });

  it("rejects arbitrary http loopback that is NOT the CAD base", async () => {
    await expect(
      safeFetch(`${baseUrl}/ok.stl`, {
        mode: "cad-artifact",
        cadBaseUrl: "http://127.0.0.1:9",
        lookup: async () => ["127.0.0.1"],
        maxBytes: 4096,
        allowedContentTypes: null,
      })
    ).rejects.toMatchObject({ reason: "scheme" });
  });
});
