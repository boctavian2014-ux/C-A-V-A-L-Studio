import { ipcMain, dialog } from "electron";
import { mcpManager } from "../../ai/mcp/mcp-client";
import {
  ensureMcpServersReady,
  getOrCreateToolRegistry,
  syncRegistryMcpTools,
} from "../../ai/tools/tool-runtime";
import { AIClient } from "../../ai/ai-client";
import { loadCavalConfig, resolveAutocompleteModel } from "../../ai/config/caval-config";
import { assertTrustedSender } from "./ipc-trust";
import {
  requireBoundWorkspaceRoot,
  type BoundWorkspaceRootGetter,
} from "./bound-workspace";
import { getMcpServerProfile } from "../../ai/mcp/mcp-capabilities";
import {
  listMcpTrustForWorkspace,
  resolveMcpTrustStatus,
  revokeMcpTrust,
  setMcpTrustDecision,
} from "../../ai/mcp/mcp-trust";
import { MCP_REMOTE_ENABLED } from "../../ai/mcp/mcp-capabilities";
import { redactSensitiveText } from "../shared/command-output-redaction";
import {
  formatInlineCompletionPrompt,
  sanitizeInlineSuggestion,
  shouldBlockInlineCompletionPath,
  INLINE_COMPLETION_MAX_PREFIX_CHARS,
} from "../shared/ai-inline-completion-contract";
import { sanitizeIdeText } from "../shared/ai-context-security";

const autocompleteClient = new AIClient();

async function confirmMcpTrust(input: {
  serverId: string;
  name: string;
  command: string;
  args?: string[];
  capabilities: string[];
}): Promise<boolean> {
  const cmdLine = redactSensitiveText(
    `${input.command} ${(input.args ?? []).join(" ")}`.trim()
  );
  const choice = await dialog.showMessageBox({
    type: "warning",
    buttons: ["Allow this MCP server", "Deny"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    message: `Trust MCP server “${input.name}” (${input.serverId})?`,
    detail: [
      "This decision is saved for this workspace until the command changes or you revoke trust in Settings.",
      "",
      `Command: ${cmdLine}`,
      `Capabilities: ${input.capabilities.length ? input.capabilities.join(", ") : "none declared"}`,
    ].join("\n"),
  });
  return choice.response === 0;
}

export function registerMcpHandlers(getBoundWorkspaceRoot: BoundWorkspaceRootGetter): void {
  ipcMain.handle("caval:mcp-ensure", async (event) => {
    assertTrustedSender(event);
    const root = getBoundWorkspaceRoot(event.sender.id)?.trim();
    if (!root) {
      return { ok: true, servers: [] };
    }
    await ensureMcpServersReady(root);
    syncRegistryMcpTools(getOrCreateToolRegistry(event.sender.id, root));
    return { ok: true, servers: mcpManager.list(), remoteEnabled: MCP_REMOTE_ENABLED };
  });

  ipcMain.handle("caval:mcp-list", async (event) => {
    assertTrustedSender(event);
    const root = getBoundWorkspaceRoot(event.sender.id)?.trim();
    if (!root) {
      return { ok: true, servers: [] };
    }
    const config = await loadCavalConfig(root);
    mcpManager.loadFromConfig(config, root);
    syncRegistryMcpTools(getOrCreateToolRegistry(event.sender.id, root));
    const servers = mcpManager.list().map((s) => {
      const cfg = config.mcp?.servers?.find((c) => c.id === s.id);
      const trust = cfg
        ? resolveMcpTrustStatus(root, s.id, cfg.command, cfg.args)
        : { status: "pending" as const, commandHash: "" };
      return {
        ...s,
        trustStatus: trust.status,
        commandHash: trust.commandHash,
        capabilities: getMcpServerProfile(s.id).capabilities,
        safety: getMcpServerProfile(s.id).safety,
      };
    });
    return { ok: true, servers, remoteEnabled: MCP_REMOTE_ENABLED };
  });

  ipcMain.handle("caval:mcp-start", async (event, serverId: string) => {
    assertTrustedSender(event);
    const root = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
    const config = await loadCavalConfig(root);
    mcpManager.loadFromConfig(config, root);
    const cfg = config.mcp?.servers?.find((s) => s.id === serverId);
    if (!cfg) {
      return { ok: false, error: "Server not found in caval.jsonc" };
    }

    const trust = resolveMcpTrustStatus(root, serverId, cfg.command, cfg.args);
    if (trust.status === "pending") {
      const profile = getMcpServerProfile(serverId);
      const allowed = await confirmMcpTrust({
        serverId,
        name: cfg.name,
        command: cfg.command,
        args: cfg.args,
        capabilities: profile.capabilities,
      });
      setMcpTrustDecision({
        workspaceRoot: root,
        serverId,
        command: cfg.command,
        args: cfg.args,
        decision: allowed ? "allow" : "deny",
      });
      if (!allowed) {
        return { ok: false, error: "MCP server trust denied by user." };
      }
    } else if (trust.status === "denied") {
      return {
        ok: false,
        error: "MCP server trust previously denied. Revoke and re-approve in Settings.",
      };
    }

    const status = await mcpManager.start(serverId, root);
    syncRegistryMcpTools(getOrCreateToolRegistry(event.sender.id, root));
    return { ok: status.running, status };
  });

  ipcMain.handle("caval:mcp-stop", async (event, serverId: string) => {
    assertTrustedSender(event);
    mcpManager.stop(serverId);
    const root = getBoundWorkspaceRoot(event.sender.id)?.trim() ?? "";
    syncRegistryMcpTools(getOrCreateToolRegistry(event.sender.id, root));
    return { ok: true };
  });

  ipcMain.handle("caval:mcp-trust-list", async (event) => {
    assertTrustedSender(event);
    const root = getBoundWorkspaceRoot(event.sender.id)?.trim();
    if (!root) return { ok: true, records: [] };
    return { ok: true, records: listMcpTrustForWorkspace(root) };
  });

  ipcMain.handle(
    "caval:mcp-trust-revoke",
    async (event, input?: { serverId?: string }) => {
      assertTrustedSender(event);
      const root = getBoundWorkspaceRoot(event.sender.id)?.trim();
      if (!root) return { ok: false, error: "No bound workspace" };
      const records = revokeMcpTrust({ workspaceRoot: root, serverId: input?.serverId });
      return { ok: true, records };
    }
  );

  ipcMain.handle(
    "caval:tool-execute",
    async (event, input: { name: string; arguments: Record<string, unknown> }) => {
      assertTrustedSender(event);
      const root = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
      const WRITE_TOOLS = new Set(["write_file"]);
      if (WRITE_TOOLS.has(input.name) && input.arguments.confirm !== true) {
        return { ok: false, error: "write_file requires confirm: true" };
      }
      const registry = getOrCreateToolRegistry(event.sender.id, root);
      return registry.execute({ name: input.name, arguments: input.arguments });
    }
  );

  ipcMain.handle(
    "caval:autocomplete",
    async (event, input: { prefix: string; filePath: string; language: string }) => {
      assertTrustedSender(event);
      const root = getBoundWorkspaceRoot(event.sender.id)?.trim();
      if (!root) {
        return { ok: true, suggestion: "" };
      }
      const filePath = typeof input.filePath === "string" ? input.filePath : "";
      if (shouldBlockInlineCompletionPath(filePath)) {
        return { ok: true, suggestion: "" };
      }
      const config = await loadCavalConfig(root);
      const model = resolveAutocompleteModel(config);
      if (config.autocomplete?.enabled === false) {
        return { ok: true, suggestion: "" };
      }
      const rawPrefix = typeof input.prefix === "string" ? input.prefix : "";
      const prefix =
        rawPrefix.length > INLINE_COMPLETION_MAX_PREFIX_CHARS
          ? rawPrefix.slice(rawPrefix.length - INLINE_COMPLETION_MAX_PREFIX_CHARS)
          : rawPrefix;
      const language = typeof input.language === "string" && input.language.trim()
        ? input.language.trim()
        : "plaintext";
      const prompt = formatInlineCompletionPrompt({
        language,
        filePath: filePath || "untitled",
        prefix: sanitizeIdeText(prefix),
      });
      try {
        const response = await autocompleteClient.complete({
          prompt,
          capability: "autocomplete",
          intent: "autocomplete",
          maxTokens: 120,
          metadata: { preferredModel: model },
        });
        const suggestion = sanitizeInlineSuggestion(response.content) ?? "";
        return { ok: true, suggestion };
      } catch {
        return { ok: true, suggestion: "" };
      }
    }
  );
}

export { ensureMcpServersReady, getOrCreateToolRegistry };
