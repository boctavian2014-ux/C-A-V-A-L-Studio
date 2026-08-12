/**
 * Lot C3 — MCP tool gate: trust, schema, network URL via Lot C1, audit.
 */
import { assertSafeOutboundUrl, NetworkGuardError } from "../../src/main/network-guard";
import { redactSensitiveText } from "../../src/shared/command-output-redaction";
import { getMcpServerProfile, isLocalSafeMcpServer } from "./mcp-capabilities";
import { isMcpServerStartAllowed, type McpTrustDecision } from "./mcp-trust";
import type { McpServerConfig } from "./mcp-client";

export interface McpAuditEntry {
  at: string;
  workspaceRoot: string;
  serverId: string;
  tool: string;
  decision: "allow" | "deny";
  reason?: string;
}

const auditLog: McpAuditEntry[] = [];

export function getMcpAuditLogForTests(): McpAuditEntry[] {
  return [...auditLog];
}

export function clearMcpAuditLogForTests(): void {
  auditLog.length = 0;
}

function appendAudit(entry: Omit<McpAuditEntry, "at">): void {
  auditLog.push({ ...entry, at: new Date().toISOString() });
  if (auditLog.length > 500) auditLog.splice(0, auditLog.length - 500);
  console.info(
    `[mcp-audit] ${entry.decision} server=${entry.serverId} tool=${entry.tool}` +
      (entry.reason ? ` reason=${redactSensitiveText(entry.reason)}` : "")
  );
}

/** Collect URL-like string args for network-capable MCP tools. */
export function extractUrlArguments(args: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (/^https?:\/\//i.test(trimmed)) urls.push(trimmed);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value && typeof value === "object") {
      for (const v of Object.values(value as Record<string, unknown>)) visit(v);
    }
  };
  visit(args);
  return urls;
}

export function validateToolArgsAgainstSchema(
  args: Record<string, unknown>,
  inputSchema: Record<string, unknown> | undefined
): { ok: true } | { ok: false; error: string } {
  if (!inputSchema || typeof inputSchema !== "object") return { ok: true };
  const required = Array.isArray((inputSchema as { required?: unknown }).required)
    ? ((inputSchema as { required: string[] }).required ?? [])
    : [];
  for (const key of required) {
    if (args[key] === undefined || args[key] === null) {
      return { ok: false, error: `Missing required tool argument: ${key}` };
    }
  }
  return { ok: true };
}

export async function assertMcpToolCallAllowed(input: {
  workspaceRoot: string;
  serverId: string;
  toolName: string;
  args: Record<string, unknown>;
  serverConfig?: McpServerConfig;
  inputSchema?: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { workspaceRoot, serverId, toolName, args, serverConfig, inputSchema } = input;
  const command = serverConfig?.command ?? "unknown";
  const serverArgs = serverConfig?.args;

  if (!isLocalSafeMcpServer(serverId)) {
    if (!isMcpServerStartAllowed(workspaceRoot, serverId, command, serverArgs)) {
      const error = `MCP server "${serverId}" is not trusted for this workspace`;
      appendAudit({
        workspaceRoot,
        serverId,
        tool: toolName,
        decision: "deny",
        reason: error,
      });
      return { ok: false, error };
    }
  }

  const schemaCheck = validateToolArgsAgainstSchema(args, inputSchema);
  if (!schemaCheck.ok) {
    appendAudit({
      workspaceRoot,
      serverId,
      tool: toolName,
      decision: "deny",
      reason: schemaCheck.error,
    });
    return schemaCheck;
  }

  const profile = getMcpServerProfile(serverId);
  if (profile.capabilities.includes("network") || extractUrlArguments(args).length > 0) {
    const urls = extractUrlArguments(args);
    for (const url of urls) {
      try {
        await assertSafeOutboundUrl(url, {
          mode: "public-https",
          skipDns: false,
        });
      } catch (err) {
        const message =
          err instanceof NetworkGuardError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        appendAudit({
          workspaceRoot,
          serverId,
          tool: toolName,
          decision: "deny",
          reason: message,
        });
        return { ok: false, error: `MCP network URL blocked: ${message}` };
      }
    }
  }

  appendAudit({
    workspaceRoot,
    serverId,
    tool: toolName,
    decision: "allow",
  });
  return { ok: true };
}

export type { McpTrustDecision };
