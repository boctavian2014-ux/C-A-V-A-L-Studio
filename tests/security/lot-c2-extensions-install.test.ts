/**
 * Lot C2 — extension install supply-chain hardening (no real network).
 */
import crypto from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EXTENSION_INSTALL_LIMITS,
  INTEGRITY_METADATA_MISSING_ERROR,
  parseMarketplaceInstallInput,
  parseOpenVsxInstallInput,
} from "../../src/main/extension-registry";
import {
  atomicInstallValidatedExtension,
  computeSha256Hex,
  extractVsixSecure,
  validateExtensionPackageJson,
} from "../../src/main/extension-install-secure";
import { createIpcHarness } from "../main/ipc-harness";

const harness = createIpcHarness();

vi.mock("electron", () => ({
  ipcMain: harness.ipcMain,
  dialog: {
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
    showMessageBox: vi.fn().mockResolvedValue({ response: 1 }),
  },
  shell: { showItemInFolder: vi.fn(), openExternal: vi.fn() },
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
  },
}));

function mockPublicDns() {
  return vi.spyOn(dns, "lookup").mockImplementation(async (_host, opts) => {
    if (typeof opts === "object" && opts && "all" in opts && opts.all) {
      return [{ address: "93.184.216.34", family: 4 }] as never;
    }
    return { address: "93.184.216.34", family: 4 } as never;
  });
}

function mkTmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function buildVsix(options: {
  packageJson: Record<string, unknown>;
  extraEntries?: Array<{ name: string; data: Buffer | string }>;
}): Buffer {
  const zip = new AdmZip();
  zip.addFile("extension/package.json", Buffer.from(JSON.stringify(options.packageJson, null, 2), "utf8"));
  for (const entry of options.extraEntries ?? []) {
    zip.addFile(entry.name, typeof entry.data === "string" ? Buffer.from(entry.data) : entry.data);
  }
  return zip.toBuffer();
}

/** Raw ZIP builder that preserves `..` in entry names (AdmZip sanitizes them away). */
function buildRawZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const crc32 = (buf: Buffer): number => {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i]!;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const u16 = (n: number) => {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(n);
    return b;
  };
  const u32 = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n);
    return b;
  };
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const data = e.data;
    const crc = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ]);
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...locals, centralDir, end]);
}

const GOOD_PKG = {
  name: "demo-ext",
  publisher: "caval",
  version: "1.0.0",
  engines: { caval: "^0.1.0" },
  main: "index.js",
};

function mockResponse(init: {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Buffer;
  location?: string;
}): Response {
  const headers = new Headers(init.headers ?? {});
  if (init.location) headers.set("location", init.location);
  const body = init.body ?? "";
  return new Response(body, { status: init.status ?? 200, headers });
}

describe("Lot C2 — payload parsing (renderer URL rejection)", () => {
  it("rejects baseUrl / downloadUrl / url on marketplace install", () => {
    expect(parseMarketplaceInstallInput({ extensionId: "caval.demo", baseUrl: "https://evil.test" })).toBeNull();
    expect(
      parseMarketplaceInstallInput({ extensionId: "caval.demo", downloadUrl: "https://evil.test/x.vsix" })
    ).toBeNull();
    expect(parseMarketplaceInstallInput({ extensionId: "caval.demo", url: "https://evil.test" })).toBeNull();
  });

  it("accepts only publisher.extension id", () => {
    expect(parseMarketplaceInstallInput({ extensionId: "caval.romania-tools" })).toEqual({
      extensionId: "caval.romania-tools",
    });
    expect(parseMarketplaceInstallInput({ extensionId: "../evil" })).toBeNull();
  });

  it("rejects URL fields on openvsx install", () => {
    expect(
      parseOpenVsxInstallInput({ namespace: "redhat", name: "java", downloadUrl: "https://evil.test" })
    ).toBeNull();
    expect(parseOpenVsxInstallInput({ namespace: "redhat", name: "java" })).toEqual({
      namespace: "redhat",
      name: "java",
    });
  });
});

describe("Lot C2 — secure extract / manifest / integrity", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkTmp("caval-lot-c2-ws-");
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("accepts correct hash and atomically installs disabled extension", () => {
    const vsix = buildVsix({
      packageJson: GOOD_PKG,
      extraEntries: [{ name: "extension/index.js", data: "exports.activate=()=>{}" }],
    });
    const sha = computeSha256Hex(vsix);
    const result = atomicInstallValidatedExtension({
      workspaceRoot: workspace,
      folderId: "caval.demo-ext-1.0.0",
      vsixBuffer: vsix,
      expectedSha256: sha,
      source: "openvsx",
      publisherHint: "caval",
      nameHint: "demo-ext",
    });
    expect(result.ok).toBe(true);
    expect(result.extension.enabled).toBe(false);
    expect(result.extension.status).toBe("installed");
    expect(fs.existsSync(path.join(result.installDir, "package.json"))).toBe(true);
    const sidecar = JSON.parse(
      fs.readFileSync(path.join(result.installDir, ".caval-extension.json"), "utf8")
    ) as { enabled: boolean; status: string };
    expect(sidecar.enabled).toBe(false);
    expect(sidecar.status).toBe("installed");
    // No staging leftovers
    const extRoot = path.join(workspace, ".cavalo", "extensions");
    const staging = fs.readdirSync(extRoot).filter((n) => n.startsWith(".staging-"));
    expect(staging).toEqual([]);
  });

  it("rejects wrong hash and leaves no install / cleans staging", () => {
    const vsix = buildVsix({ packageJson: GOOD_PKG });
    const wrong = "a".repeat(64);
    expect(() =>
      atomicInstallValidatedExtension({
        workspaceRoot: workspace,
        folderId: "caval.badhash",
        vsixBuffer: vsix,
        expectedSha256: wrong,
        source: "marketplace",
      })
    ).toThrow(/Integritate|SHA-256/i);

    const extRoot = path.join(workspace, ".cavalo", "extensions");
    if (fs.existsSync(extRoot)) {
      expect(fs.readdirSync(extRoot)).toEqual([]);
    }
  });

  it("rejects zip-slip entries", () => {
    const buf = buildRawZip([
      { name: "extension/package.json", data: Buffer.from(JSON.stringify(GOOD_PKG), "utf8") },
      { name: "extension/foo/../../evil.txt", data: Buffer.from("pwned") },
    ]);
    expect(() => extractVsixSecure(buf, path.join(workspace, "extract"))).toThrow(/zip-slip/i);
  });

  it("rejects too many zip entries (zip bomb)", () => {
    const many = new AdmZip();
    many.addFile("extension/package.json", Buffer.from(JSON.stringify(GOOD_PKG), "utf8"));
    const limit = EXTENSION_INSTALL_LIMITS.ZIP_MAX_ENTRIES;
    for (let i = 0; i < limit + 1; i++) {
      many.addFile(`extension/n${i}.txt`, Buffer.from("a"));
    }
    expect(() => extractVsixSecure(many.toBuffer(), path.join(workspace, "bomb"))).toThrow(/prea multe fișiere|zip/i);
  });

  it("rejects declared uncompressed size over limit (zip bomb)", () => {
    // Raw ZIP local header with tiny payload but huge declared uncompressed size.
    const name = Buffer.from("extension/package.json", "utf8");
    const data = Buffer.from(JSON.stringify(GOOD_PKG), "utf8");
    const u16 = (n: number) => {
      const b = Buffer.alloc(2);
      b.writeUInt16LE(n);
      return b;
    };
    const u32 = (n: number) => {
      const b = Buffer.alloc(4);
      b.writeUInt32LE(n);
      return b;
    };
    const huge = EXTENSION_INSTALL_LIMITS.ZIP_MAX_UNCOMPRESSED_BYTES + 1;
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(data.length),
      u32(huge),
      u16(name.length),
      u16(0),
      name,
      data,
    ]);
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(data.length),
      u32(huge),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(0),
      name,
    ]);
    const end = Buffer.concat([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(1),
      u16(1),
      u32(central.length),
      u32(local.length),
      u16(0),
    ]);
    const buf = Buffer.concat([local, central, end]);
    expect(() => extractVsixSecure(buf, path.join(workspace, "huge"))).toThrow(/decomprimat|zip/i);
  });

  it("rejects postinstall lifecycle scripts", () => {
    expect(() =>
      validateExtensionPackageJson({
        ...GOOD_PKG,
        scripts: { postinstall: "node evil.js" },
      })
    ).toThrow(/postinstall|lifecycle/i);
  });

  it("rejects entrypoint outside root", () => {
    expect(() =>
      validateExtensionPackageJson({
        ...GOOD_PKG,
        main: "../outside.js",
      })
    ).toThrow(/entrypoint|rădăcinii/i);
  });

  it("rejects native executables in VSIX", () => {
    const vsix = buildVsix({
      packageJson: GOOD_PKG,
      extraEntries: [{ name: "extension/native.node", data: Buffer.from([0, 1, 2]) }],
    });
    expect(() => extractVsixSecure(vsix, path.join(workspace, "native"))).toThrow(/nativ|native/i);
  });

  it("failed update keeps previous version intact", () => {
    const v1 = buildVsix({
      packageJson: { ...GOOD_PKG, version: "1.0.0" },
      extraEntries: [{ name: "extension/marker.txt", data: "v1" }],
    });
    const sha1 = computeSha256Hex(v1);
    atomicInstallValidatedExtension({
      workspaceRoot: workspace,
      folderId: "caval.demo",
      vsixBuffer: v1,
      expectedSha256: sha1,
      source: "openvsx",
    });
    const installDir = path.join(workspace, ".cavalo", "extensions", "caval.demo");
    expect(fs.readFileSync(path.join(installDir, "marker.txt"), "utf8")).toBe("v1");

    const v2bad = buildVsix({
      packageJson: {
        ...GOOD_PKG,
        version: "2.0.0",
        scripts: { postinstall: "curl evil" },
      },
    });
    const sha2 = computeSha256Hex(v2bad);
    expect(() =>
      atomicInstallValidatedExtension({
        workspaceRoot: workspace,
        folderId: "caval.demo",
        vsixBuffer: v2bad,
        expectedSha256: sha2,
        source: "openvsx",
      })
    ).toThrow(/postinstall|lifecycle/i);

    expect(fs.readFileSync(path.join(installDir, "marker.txt"), "utf8")).toBe("v1");
    expect(JSON.parse(fs.readFileSync(path.join(installDir, "package.json"), "utf8")).version).toBe("1.0.0");
  });
});

describe("Lot C2 — IPC handlers (mocked network)", () => {
  let workspace: string;
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    harness.reset();
    workspace = mkTmp("caval-lot-c2-ipc-");
    fetchImpl = vi.fn();

    vi.resetModules();
    vi.doMock("../../src/main/marketplace-server", () => ({
      getMarketplaceBaseUrl: () => "http://127.0.0.1:8787",
      startMarketplaceServer: async () => true,
    }));

    const { registerExtensionHandlers, __resetExtensionHostForTests } = await import(
      "../../src/main/extension-handlers"
    );
    __resetExtensionHostForTests();
    registerExtensionHandlers(() => workspace);

    // Patch global fetch used by safeFetch default — handlers call downloadOpenVsxVsix without deps.
    vi.stubGlobal("fetch", fetchImpl);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("extensions:install rejects baseUrl from renderer", async () => {
    const res = await harness.invoke<{ ok: boolean; error?: string }>("extensions:install", {
      extensionId: "caval.demo",
      baseUrl: "https://evil.example",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/baseUrl|URL|invalid/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("extensions:install requests metadata only from allowlisted marketplace base", async () => {
    const vsix = buildVsix({ packageJson: GOOD_PKG });
    const sha = computeSha256Hex(vsix);
    fetchImpl.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/extensions/caval.demo/download") && !u.includes("package.vsix")) {
        return mockResponse({
          body: JSON.stringify({
            version: "1.0.0",
            sha256: sha,
            downloadUrl: "/storage/marketplace/caval.demo/1.0.0/package.vsix",
            sizeBytes: vsix.length,
          }),
        });
      }
      if (u.includes("/storage/marketplace/caval.demo/1.0.0/package.vsix")) {
        return mockResponse({ body: vsix, headers: { "content-type": "application/octet-stream" } });
      }
      return mockResponse({ status: 404, body: "no" });
    });

    const res = await harness.invoke<{ ok: boolean; error?: string; extension?: { enabled: boolean; status: string } }>(
      "extensions:install",
      { extensionId: "caval.demo" }
    );
    expect(res.ok).toBe(true);
    expect(res.extension?.enabled).toBe(false);
    expect(res.extension?.status).toBe("installed");
    const urls = fetchImpl.mock.calls.map((c) => String(c[0]));
    expect(urls.every((u) => u.startsWith("http://127.0.0.1:8787/"))).toBe(true);
    expect(urls.some((u) => u.includes("evil"))).toBe(false);
  });

  it("extensions:install rejects missing verifiable sha256", async () => {
    fetchImpl.mockResolvedValueOnce(
      mockResponse({
        body: JSON.stringify({
          version: "0.1.0",
          sha256: "seed",
          downloadUrl: "/storage/x.vsix",
        }),
      })
    );
    const res = await harness.invoke<{ ok: boolean; error?: string }>("extensions:install", {
      extensionId: "caval.romania-tools",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe(INTEGRITY_METADATA_MISSING_ERROR);
  });

  it("openvsx:install rejects external metadata download host", async () => {
    fetchImpl.mockImplementation(async (url: string) => {
      if (String(url).includes("/latest")) {
        return mockResponse({
          body: JSON.stringify({
            namespace: "evil",
            name: "pkg",
            version: "1.0.0",
            engines: { vscode: "^1.80.0" },
            files: {
              download: "https://evil.example/pkg.vsix",
              sha256: "https://open-vsx.org/api/evil/pkg/1.0.0/file/sha256",
            },
          }),
        });
      }
      return mockResponse({ status: 404, body: "no" });
    });

    // Inject lookup via module — download uses default fetch; host check fails before download.
    const res = await harness.invoke<{ ok: boolean; error?: string }>("openvsx:install", {
      namespace: "evil",
      name: "pkg",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/allowlist|Host OpenVSX|invalid|Blocked/i);
  });

  it("openvsx:install rejects redirect to non-allowlisted / private IP", async () => {
    const vsix = buildVsix({ packageJson: { ...GOOD_PKG, engines: { vscode: "^1.80.0" } } });
    const sha = computeSha256Hex(vsix);

    fetchImpl.mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/latest")) {
        return mockResponse({
          body: JSON.stringify({
            namespace: "caval",
            name: "demo",
            version: "1.0.0",
            engines: { vscode: "^1.80.0" },
            files: {
              download: "https://open-vsx.org/api/caval/demo/1.0.0/file/demo.vsix",
              sha256: "https://open-vsx.org/api/caval/demo/1.0.0/file/demo.sha256",
            },
          }),
        });
      }
      if (u.includes("demo.sha256")) {
        return mockResponse({ body: sha });
      }
      if (u.includes("demo.vsix") && !u.includes("evil")) {
        // Manual redirect to private IP host
        return mockResponse({ status: 302, location: "https://127.0.0.1/steal.vsix" });
      }
      void init;
      return mockResponse({ status: 500, body: "no" });
    });

    const res = await harness.invoke<{ ok: boolean; error?: string }>("openvsx:install", {
      namespace: "caval",
      name: "demo",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Blocked|private|network guard|allowlist|Host/i);
  });

  it("openvsx:install succeeds with correct hash → installed + disabled", async () => {
    const vsix = buildVsix({
      packageJson: { ...GOOD_PKG, engines: { vscode: "^1.80.0" } },
      extraEntries: [{ name: "extension/index.js", data: "// no run" }],
    });
    const sha = computeSha256Hex(vsix);

    fetchImpl.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.endsWith("/latest")) {
        return mockResponse({
          body: JSON.stringify({
            namespace: "caval",
            name: "demo",
            version: "1.0.0",
            engines: { vscode: "^1.80.0" },
            files: {
              download: "https://open-vsx.org/api/caval/demo/1.0.0/file/demo.vsix",
              sha256: "https://open-vsx.org/api/caval/demo/1.0.0/file/demo.sha256",
            },
          }),
        });
      }
      if (u.includes("demo.sha256")) return mockResponse({ body: sha });
      if (u.includes("demo.vsix")) {
        return mockResponse({
          body: vsix,
          headers: { "content-type": "application/octet-stream", "content-length": String(vsix.length) },
        });
      }
      return mockResponse({ status: 404, body: "no" });
    });

    const lookupSpy = mockPublicDns();
    const res = await harness.invoke<{
      ok: boolean;
      error?: string;
      extension?: { enabled: boolean; status: string; sha256?: string };
    }>("openvsx:install", { namespace: "caval", name: "demo" });
    lookupSpy.mockRestore();

    expect(res.ok).toBe(true);
    expect(res.extension?.enabled).toBe(false);
    expect(res.extension?.status).toBe("installed");
    expect(res.extension?.sha256).toBe(sha);
    expect(fs.existsSync(path.join(workspace, ".cavalo", "extensions", "caval.demo-1.0.0", "package.json"))).toBe(
      true
    );
  });

  it("openvsx:install wrong hash rejects and does not leave install", async () => {
    const vsix = buildVsix({ packageJson: { ...GOOD_PKG, engines: { vscode: "^1.80.0" } } });
    const wrong = crypto.randomBytes(32).toString("hex");

    fetchImpl.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.endsWith("/latest")) {
        return mockResponse({
          body: JSON.stringify({
            namespace: "caval",
            name: "demo",
            version: "1.0.0",
            engines: { vscode: "^1.80.0" },
            files: {
              download: "https://open-vsx.org/api/caval/demo/1.0.0/file/demo.vsix",
              sha256: "https://open-vsx.org/api/caval/demo/1.0.0/file/demo.sha256",
            },
          }),
        });
      }
      if (u.includes("demo.sha256")) return mockResponse({ body: wrong });
      if (u.includes("demo.vsix")) return mockResponse({ body: vsix });
      return mockResponse({ status: 404, body: "no" });
    });

    const lookupSpy = mockPublicDns();
    const res = await harness.invoke<{ ok: boolean; error?: string }>("openvsx:install", {
      namespace: "caval",
      name: "demo",
    });
    lookupSpy.mockRestore();

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Integritate|SHA-256/i);
    const extRoot = path.join(workspace, ".cavalo", "extensions");
    if (fs.existsSync(extRoot)) {
      expect(fs.readdirSync(extRoot).filter((n) => !n.startsWith("."))).toEqual([]);
    }
  });

  it("successful extension is installed + disabled and does not expose enable API", async () => {
    const vsix = buildVsix({
      packageJson: { ...GOOD_PKG, engines: { vscode: "^1.80.0" } },
      extraEntries: [{ name: "extension/index.js", data: "module.exports = {}" }],
    });
    const sha = computeSha256Hex(vsix);
    fetchImpl.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.endsWith("/latest")) {
        return mockResponse({
          body: JSON.stringify({
            namespace: "caval",
            name: "norun",
            version: "1.0.0",
            engines: { vscode: "^1.80.0" },
            files: {
              download: "https://open-vsx.org/api/caval/norun/1.0.0/file/x.vsix",
              sha256: "https://open-vsx.org/api/caval/norun/1.0.0/file/x.sha256",
            },
          }),
        });
      }
      if (u.includes("x.sha256")) return mockResponse({ body: sha });
      if (u.includes("x.vsix")) return mockResponse({ body: vsix });
      return mockResponse({ status: 404, body: "no" });
    });
    const lookupSpy = mockPublicDns();
    const res = await harness.invoke<{ ok: boolean; extension?: { enabled: boolean; status: string } }>(
      "openvsx:install",
      { namespace: "caval", name: "norun" }
    );
    lookupSpy.mockRestore();
    expect(res.ok).toBe(true);
    expect(res.extension?.enabled).toBe(false);
    expect(res.extension?.status).toBe("installed");
    expect(harness.handlers.has("extensions:enable")).toBe(false);
    expect(harness.handlers.has("openvsx:enable")).toBe(false);
  });
});

describe("Lot C2 — OpenVSX URL host gate (unit)", () => {
  it("isInstallableOpenVsxExtension rejects non-allowlisted download host", async () => {
    const { isInstallableOpenVsxExtension } = await import("../../src/main/open-vsx-client");
    expect(
      isInstallableOpenVsxExtension({
        namespace: "a",
        name: "b",
        files: { download: "https://evil.example/x.vsix" },
        engines: { vscode: "^1.80.0" },
      })
    ).toBe(false);
    expect(
      isInstallableOpenVsxExtension({
        namespace: "a",
        name: "b",
        files: { download: "https://open-vsx.org/a/b/file" },
        engines: { vscode: "^1.80.0" },
      })
    ).toBe(true);
  });
});
