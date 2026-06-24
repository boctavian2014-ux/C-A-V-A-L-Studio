import { ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { mcpManager } from "../../ai/mcp/mcp-client";
import { DEFAULT_CAVAL_CONFIG, type CavalConfig } from "../../ai/modes/agent-modes";
import { ToolRegistry } from "../../ai/tools/tool-registry";
import { ContextEngineApi } from "../../context-engine/api";
import { AIClient } from "../../ai/ai-client";

const contextEngine = new ContextEngineApi();
const toolRegistries = new Map<number, ToolRegistry>();

function getToolRegistry(senderId: number, workspaceRoot: string): ToolRegistry {
  let registry = toolRegistries.get(senderId);
  if (!registry) {
    registry = new ToolRegistry(workspaceRoot, contextEngine);
    registry.setMcpInvoker((serverId, toolName, args) => mcpManager.callTool(serverId, toolName, args));
    toolRegistries.set(senderId, registry);
  }
  return registry;
}

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
  ipcMain.handle("caval:mcp-list", async (event) => {
    const root = getWorkspaceRoot(event.sender.id);
    const config = await loadCavalConfig(root);
    mcpManager.loadFromConfig(config);
    return { ok: true, servers: mcpManager.list() };
  });

  ipcMain.handle("caval:mcp-start", async (_event, serverId: string) => {
    const status = await mcpManager.start(serverId);
    return { ok: status.running, status };
  });

  ipcMain.handle("caval:mcp-stop", async (_event, serverId: string) => {
    mcpManager.stop(serverId);
    return { ok: true };
  });

  ipcMain.handle("caval:tool-execute", async (event, input: { name: string; arguments: Record<string, unknown> }) => {
    const root = getWorkspaceRoot(event.sender.id);
    const registry = getToolRegistry(event.sender.id, root);
    const result = await registry.execute({ name: input.name, arguments: input.arguments });
    return result;
  });

  ipcMain.handle("caval:autocomplete", async (event, input: { prefix: string; filePath: string; language: string }) => {
    const root = getWorkspaceRoot(event.sender.id);
    const config = await loadCavalConfig(root);
    const model = config.autocomplete?.model ?? "north-mini-code";
    if (config.autocomplete?.enabled === false) {
      return { ok: true, suggestion: "" };
    }
    try {
      const client = new AIClient();
      const response = await client.complete({
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
