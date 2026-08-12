/**
 * Lot C3 — persistent MCP server trust per workspace + command hash.
 * Similar to VS Code workspace trust / Lot C2 VSIX trust model.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { redactSensitiveText } from "../../src/shared/command-output-redaction";
import type { McpCapability } from "./mcp-capabilities";
import { getMcpServerProfile } from "./mcp-capabilities";

export type McpTrustDecision = "allow" | "deny";

export interface McpTrustRecord {
  workspaceRoot: string;
  serverId: string;
  commandHash: string;
  decision: McpTrustDecision;
  decidedAt: string;
  command?: string;
  capabilities?: McpCapability[];
}

export interface McpTrustStoreFile {
  version: 1;
  records: McpTrustRecord[];
  audit: Array<{
    at: string;
    workspaceRoot: string;
    serverId: string;
    commandHash: string;
    decision: McpTrustDecision;
  }>;
}

let memoryStore: McpTrustStoreFile | null = null;
let storePathOverride: string | null = null;

export function setMcpTrustStorePathForTests(filePath: string | null): void {
  storePathOverride = filePath;
  memoryStore = null;
}

function trustFilePath(): string {
  if (storePathOverride) return storePathOverride;
  try {
    return path.join(app.getPath("userData"), "mcp-server-trust.json");
  } catch {
    return path.join(process.cwd(), ".caval-mcp-trust-test.json");
  }
}

function normalizeRoot(workspaceRoot: string): string {
  return path.resolve(workspaceRoot.trim());
}

export function hashMcpCommand(command: string, args: string[] | undefined): string {
  const payload = JSON.stringify({
    command: command.trim(),
    args: (args ?? []).map((a) => String(a)),
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function readStore(): McpTrustStoreFile {
  if (memoryStore) return memoryStore;
  try {
    const file = trustFilePath();
    if (!fs.existsSync(file)) {
      memoryStore = { version: 1, records: [], audit: [] };
      return memoryStore;
    }
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as McpTrustStoreFile;
    memoryStore = {
      version: 1,
      records: Array.isArray(parsed.records) ? parsed.records : [],
      audit: Array.isArray(parsed.audit) ? parsed.audit : [],
    };
    return memoryStore;
  } catch {
    memoryStore = { version: 1, records: [], audit: [] };
    return memoryStore;
  }
}

function writeStore(store: McpTrustStoreFile): void {
  memoryStore = store;
  const file = trustFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store, null, 2), "utf8");
}

export function getMcpTrustRecord(
  workspaceRoot: string,
  serverId: string,
  commandHash: string
): McpTrustRecord | undefined {
  const root = normalizeRoot(workspaceRoot);
  return readStore().records.find(
    (r) =>
      normalizeRoot(r.workspaceRoot) === root &&
      r.serverId === serverId &&
      r.commandHash === commandHash
  );
}

export type McpTrustStatus = "local_safe" | "allowed" | "denied" | "pending";

export function resolveMcpTrustStatus(
  workspaceRoot: string,
  serverId: string,
  command: string,
  args: string[] | undefined
): { status: McpTrustStatus; commandHash: string; record?: McpTrustRecord } {
  const commandHash = hashMcpCommand(command, args);
  if (getMcpServerProfile(serverId).safety === "LOCAL_SAFE") {
    return { status: "local_safe", commandHash };
  }
  const record = getMcpTrustRecord(workspaceRoot, serverId, commandHash);
  if (!record) return { status: "pending", commandHash };
  if (record.decision === "allow") return { status: "allowed", commandHash, record };
  return { status: "denied", commandHash, record };
}

export function isMcpServerStartAllowed(
  workspaceRoot: string,
  serverId: string,
  command: string,
  args: string[] | undefined
): boolean {
  const { status } = resolveMcpTrustStatus(workspaceRoot, serverId, command, args);
  return status === "local_safe" || status === "allowed";
}

export function setMcpTrustDecision(input: {
  workspaceRoot: string;
  serverId: string;
  command: string;
  args?: string[];
  decision: McpTrustDecision;
}): McpTrustRecord {
  const commandHash = hashMcpCommand(input.command, input.args);
  const profile = getMcpServerProfile(input.serverId);
  const record: McpTrustRecord = {
    workspaceRoot: normalizeRoot(input.workspaceRoot),
    serverId: input.serverId,
    commandHash,
    decision: input.decision,
    decidedAt: new Date().toISOString(),
    command: redactSensitiveText(`${input.command} ${(input.args ?? []).join(" ")}`.trim()),
    capabilities: profile.capabilities,
  };

  const store = readStore();
  store.records = store.records.filter(
    (r) =>
      !(
        normalizeRoot(r.workspaceRoot) === record.workspaceRoot &&
        r.serverId === record.serverId &&
        r.commandHash === record.commandHash
      )
  );
  store.records.push(record);
  store.audit.push({
    at: record.decidedAt,
    workspaceRoot: record.workspaceRoot,
    serverId: record.serverId,
    commandHash: record.commandHash,
    decision: record.decision,
  });
  // Cap audit length
  if (store.audit.length > 500) store.audit = store.audit.slice(-500);
  writeStore(store);
  console.info(
    `[mcp-trust] decision=${record.decision} server=${record.serverId} hash=${record.commandHash.slice(0, 12)}…`
  );
  return record;
}

export function revokeMcpTrust(opts: {
  workspaceRoot?: string;
  serverId?: string;
}): McpTrustRecord[] {
  const store = readStore();
  const root = opts.workspaceRoot ? normalizeRoot(opts.workspaceRoot) : undefined;
  const before = store.records.length;
  store.records = store.records.filter((r) => {
    const sameRoot = root ? normalizeRoot(r.workspaceRoot) === root : true;
    const sameServer = opts.serverId ? r.serverId === opts.serverId : true;
    // Remove when matching filters (both apply when provided).
    if (root && opts.serverId) {
      return !(sameRoot && sameServer);
    }
    if (root && !opts.serverId) {
      return !sameRoot;
    }
    if (!root && opts.serverId) {
      return r.serverId !== opts.serverId;
    }
    // No filters → clear all
    return false;
  });
  if (store.records.length !== before) {
    writeStore(store);
  }
  return store.records;
}

export function listMcpTrustForWorkspace(workspaceRoot: string): McpTrustRecord[] {
  const root = normalizeRoot(workspaceRoot);
  return readStore().records.filter((r) => normalizeRoot(r.workspaceRoot) === root);
}
