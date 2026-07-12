import { ContextEngineApi } from "../../context-engine/api";
import { mcpManager } from "../mcp/mcp-client";
import { loadCavalConfig } from "../config/caval-config";
import { ToolRegistry, type ToolDefinition } from "./tool-registry";

const contextEngine = new ContextEngineApi();
const registries = new Map<number, ToolRegistry>();

export function syncRegistryMcpTools(registry: ToolRegistry): void {
  registry.setMcpToolDefinitions(mcpManager.getToolDefinitions());
}

export function getOrCreateToolRegistry(senderId: number, workspaceRoot: string): ToolRegistry {
  let registry = registries.get(senderId);
  if (!registry) {
    registry = new ToolRegistry(workspaceRoot, contextEngine);
    registry.setMcpInvoker((serverId, toolName, args) =>
      mcpManager.callTool(serverId, toolName, args)
    );
    registries.set(senderId, registry);
  }
  syncRegistryMcpTools(registry);
  return registry;
}

export async function ensureMcpServersReady(workspaceRoot: string): Promise<void> {
  const config = await loadCavalConfig(workspaceRoot);
  mcpManager.loadFromConfig(config, workspaceRoot);

  const enabled = (config.mcp?.servers ?? []).filter((s) => s.enabled !== false);
  await Promise.all(
    enabled.map(async (server) => {
      const running = mcpManager.list().find((s) => s.id === server.id)?.running;
      if (!running) {
        await mcpManager.start(server.id, workspaceRoot);
      }
    })
  );
}

export function listAvailableTools(registry: ToolRegistry): ToolDefinition[] {
  syncRegistryMcpTools(registry);
  return registry.listTools();
}
