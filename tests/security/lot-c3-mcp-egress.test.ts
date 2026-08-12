import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mergeMcpServerEnv } from "../../ai/mcp/mcp-env";
import { DEFAULT_CAVAL_CONFIG } from "../../ai/modes/agent-modes";
import { getMcpServerProfile, isLocalSafeMcpServer, MCP_REMOTE_ENABLED } from "../../ai/mcp/mcp-capabilities";
import {
  hashMcpCommand,
  isMcpServerStartAllowed,
  resolveMcpTrustStatus,
  setMcpTrustDecision,
  setMcpTrustStorePathForTests,
  revokeMcpTrust,
} from "../../ai/mcp/mcp-trust";
import {
  assertMcpToolCallAllowed,
  clearMcpAuditLogForTests,
  extractUrlArguments,
} from "../../ai/mcp/mcp-tool-gate";
import { connectMcpRemote } from "../../ai/mcp/mcp-remote";
import { assertTrustedSender } from "../../src/main/ipc-trust";

describe("Lot C3 — MCP env scrub", () => {
  it("does not inherit process.env secrets or undeclared keys", () => {
    const source = {
      PATH: "/usr/bin",
      HOME: "/home/user",
      OPENROUTER_API_KEY: "sk-secret",
      FIRECRAWL_API_KEY: "from-process",
      RANDOM_CUSTOM_VAR: "should-not-appear",
      STRIPE_SECRET_KEY: "stripe",
    } as NodeJS.ProcessEnv;

    const env = mergeMcpServerEnv(
      { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
      { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_ok", FIRECRAWL_API_KEY: "fc_secret" },
      source,
      "github"
    );

    expect(env.PATH).toBe("/usr/bin");
    expect(env.OPENROUTER_API_KEY).toBeUndefined();
    expect(env.FIRECRAWL_API_KEY).toBeUndefined();
    expect(env.RANDOM_CUSTOM_VAR).toBeUndefined();
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe("ghp_ok");
  });

  it("injects FIRECRAWL only for firecrawl server profile", () => {
    const env = mergeMcpServerEnv(
      undefined,
      { FIRECRAWL_API_KEY: "fc_from_secrets" },
      { PATH: "/bin", FIRECRAWL_API_KEY: "from-process", OPENROUTER_API_KEY: "x" },
      "firecrawl"
    );
    expect(env.FIRECRAWL_API_KEY).toBe("fc_from_secrets");
    expect(env.OPENROUTER_API_KEY).toBeUndefined();
  });
});

describe("Lot C3 — default server classification", () => {
  it("only LOCAL_SAFE defaults are enabled:true", () => {
    const servers = DEFAULT_CAVAL_CONFIG.mcp?.servers ?? [];
    for (const s of servers) {
      const profile = getMcpServerProfile(s.id);
      if (profile.safety === "LOCAL_SAFE") {
        expect(s.enabled).toBe(true);
      } else {
        expect(s.enabled).toBe(false);
      }
    }
    expect(isLocalSafeMcpServer("memory")).toBe(true);
    expect(isLocalSafeMcpServer("fetch")).toBe(false);
  });
});

describe("Lot C3 — workspace trust", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-trust-"));
    setMcpTrustStorePathForTests(path.join(tmp, "trust.json"));
  });

  afterEach(() => {
    setMcpTrustStorePathForTests(null);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("unknown NETWORK server does not auto-allow start", () => {
    expect(isMcpServerStartAllowed("/ws", "fetch", "uvx", ["mcp-server-fetch"])).toBe(false);
    expect(resolveMcpTrustStatus("/ws", "fetch", "uvx", ["mcp-server-fetch"]).status).toBe("pending");
  });

  it("persists allow and skips confirm on second start; hash change re-prompts", () => {
    setMcpTrustDecision({
      workspaceRoot: "/ws",
      serverId: "fetch",
      command: "uvx",
      args: ["mcp-server-fetch"],
      decision: "allow",
    });
    expect(isMcpServerStartAllowed("/ws", "fetch", "uvx", ["mcp-server-fetch"])).toBe(true);

    const changed = hashMcpCommand("uvx", ["mcp-server-fetch", "--extra"]);
    expect(changed).not.toBe(hashMcpCommand("uvx", ["mcp-server-fetch"]));
    expect(isMcpServerStartAllowed("/ws", "fetch", "uvx", ["mcp-server-fetch", "--extra"])).toBe(false);
  });

  it("LOCAL_SAFE works without trust record", () => {
    expect(isMcpServerStartAllowed("/ws", "memory", "npx", ["-y", "@modelcontextprotocol/server-memory"])).toBe(
      true
    );
    expect(resolveMcpTrustStatus("/ws", "memory", "npx", []).status).toBe("local_safe");
  });

  it("revoke clears trust", () => {
    setMcpTrustDecision({
      workspaceRoot: "/ws",
      serverId: "fetch",
      command: "uvx",
      args: ["mcp-server-fetch"],
      decision: "allow",
    });
    revokeMcpTrust({ workspaceRoot: "/ws", serverId: "fetch" });
    expect(isMcpServerStartAllowed("/ws", "fetch", "uvx", ["mcp-server-fetch"])).toBe(false);
  });
});

describe("Lot C3 — tool gate + network-guard", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-trust-"));
    setMcpTrustStorePathForTests(path.join(tmp, "trust.json"));
    clearMcpAuditLogForTests();
  });

  afterEach(() => {
    setMcpTrustStorePathForTests(null);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("rejects NETWORK tool without trust", async () => {
    const result = await assertMcpToolCallAllowed({
      workspaceRoot: "/ws",
      serverId: "fetch",
      toolName: "get",
      args: { url: "https://example.com" },
      serverConfig: { id: "fetch", name: "Fetch", command: "uvx", args: ["mcp-server-fetch"] },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects private IP URL via Lot C1 even when trusted", async () => {
    setMcpTrustDecision({
      workspaceRoot: "/ws",
      serverId: "fetch",
      command: "uvx",
      args: ["mcp-server-fetch"],
      decision: "allow",
    });
    const result = await assertMcpToolCallAllowed({
      workspaceRoot: "/ws",
      serverId: "fetch",
      toolName: "get",
      args: { url: "https://127.0.0.1/secret" },
      serverConfig: { id: "fetch", name: "Fetch", command: "uvx", args: ["mcp-server-fetch"] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/blocked|private|IP|scheme|MCP network/i);
  });

  it("extracts nested URL args", () => {
    expect(extractUrlArguments({ nested: { url: "https://a.example/x" } })).toEqual([
      "https://a.example/x",
    ]);
  });
});

describe("Lot C3 — remote flag OFF", () => {
  it("MCP_REMOTE_ENABLED is false and connect fails explicitly", async () => {
    expect(MCP_REMOTE_ENABLED).toBe(false);
    const res = await connectMcpRemote({
      id: "remote",
      name: "Remote",
      transport: "sse",
      url: "https://evil.example/mcp",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/disabled|mcp\.remote/i);
  });
});

describe("Lot C3 — untrusted sender", () => {
  it("rejects untrusted IPC sender", () => {
    const event = {
      sender: {
        isDestroyed: () => false,
        getURL: () => "https://evil.example/",
        mainFrame: { parent: null, url: "https://evil.example/" },
      },
      senderFrame: { parent: null, url: "https://evil.example/" },
    };
    expect(() => assertTrustedSender(event as never)).toThrow(/Untrusted IPC sender/);
  });
});
