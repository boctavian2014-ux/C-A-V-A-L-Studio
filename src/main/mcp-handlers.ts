import { ipcMain } from "electron";
import { mcpManager } from "../../ai/mcp/mcp-client";
import { DEFAULT_CAVAL_CONFIG, type CavalConfig } from "../../ai/modes/agent-modes";
import {
  ensureMcpServersReady,
  getOrCreateToolRegistry,
  syncRegistryMcpTools,
} from "../../ai/tools/tool-runtime";
import { AIClient } from "../../ai/ai-client";
import fs from "node:fs/promises";
import path from "node:path";

const autocompleteClient = new AIClient();

async function loadCavalConfig(workspaceRoot: string): Promise<CavalConfig> {
  try {
    const configPath = path.join(workspaceRoot, "caval.jsonc");
    const raw = await fs.readFile(configPath, "utf8");
    const json = raw.replace(/\/\/.*$/gm, "").replace(/,\s*}/g, "}");
    return { ...DEFAULT_CAVAL_CONFIG, ...JSON.parse(json) };
  } catch {
    return DEFAULT_CAVAL_CONFIG;
  }
}

export function registerMcpHandlers(getWorkspaceRoot: (senderId: number) => string): void {
  ipcMain.handle("caval:mcp-ensure", async (event) => {
    const root = getWorkspaceRoot(event.sender.id);
    if (!root?.trim()) {
      return { ok: true, servers: [] };
    }
    await ensureMcpServersReady(root);
    syncRegistryMcpTools(getOrCreateToolRegistry(event.sender.id, root));
    return { ok: true, servers: mcpManager.list() };
  });

  ipcMain.handle("caval:mcp-list", async (event) => {
    const root = getWorkspaceRoot(event.sender.id);
    const config = await loadCavalConfig(root);
    mcpManager.loadFromConfig(config, root);
    syncRegistryMcpTools(getOrCreateToolRegistry(event.sender.id, root));
    return { ok: true, servers: mcpManager.list() };
  });

  ipcMain.handle("caval:mcp-start", async (event, serverId: string) => {
    const root = getWorkspaceRoot(event.sender.id);
    const status = await mcpManager.start(serverId, root);
    syncRegistryMcpTools(getOrCreateToolRegistry(event.sender.id, root));
    return { ok: status.running, status };
  });

  ipcMain.handle("caval:mcp-stop", async (event, serverId: string) => {
    mcpManager.stop(serverId);
    syncRegistryMcpTools(getOrCreateToolRegistry(event.sender.id, getWorkspaceRoot(event.sender.id)));
    return { ok: true };
  });

  ipcMain.handle("caval:tool-execute", async (event, input: { name: string; arguments: Record<string, unknown> }) => {
    const root = getWorkspaceRoot(event.sender.id);
    const WRITE_TOOLS = new Set(["write_file"]);
    if (WRITE_TOOLS.has(input.name) && input.arguments.confirm !== true) {
      return { ok: false, error: "write_file requires confirm: true" };
    }
    const registry = getOrCreateToolRegistry(event.sender.id, root);
    return registry.execute({ name: input.name, arguments: input.arguments });
  });

  ipcMain.handle("caval:autocomplete", async (event, input: { prefix: string; filePath: string; language: string }) => {
    const root = getWorkspaceRoot(event.sender.id);
    const config = await loadCavalConfig(root);
    const model = config.autocomplete?.model ?? "north-mini-code";
    if (config.autocomplete?.enabled === false) {
      return { ok: true, suggestion: "" };
    }
    try {
      const response = await autocompleteClient.complete({
        prompt: `Complete the following ${input.language} code. Return ONLY the completion text, no explanation.\n\n${input.prefix}`,
        capability: "autocomplete",
        intent: "autocomplete",
        maxTokens: 120,
        metadata: { preferredModel: model },
      });
      return { ok: true, suggestion: response.content.trim() };
    } catch {
      return { ok: true, suggestion: "" };
    }
  });
}

export { ensureMcpServersReady, getOrCreateToolRegistry };
