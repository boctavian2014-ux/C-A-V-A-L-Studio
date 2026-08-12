import { ContextEngineApi } from "../../context-engine/api";
import { mcpManager } from "../mcp/mcp-client";
import { loadCavalConfig } from "../config/caval-config";
import { ToolRegistry, type ToolDefinition } from "./tool-registry";
import { isMcpServerStartAllowed } from "../mcp/mcp-trust";
import { assertMcpToolCallAllowed } from "../mcp/mcp-tool-gate";
import { isLocalSafeMcpServer } from "../mcp/mcp-capabilities";

const contextEngine = new ContextEngineApi();
const registries = new Map<number, ToolRegistry>();

export function setMcpSecretsProvider(provider: () => Record<string, string>): void {
  mcpManager.setSecretsProvider(provider);
}

export function syncRegistryMcpTools(registry: ToolRegistry): void {
  registry.setMcpToolDefinitions(mcpManager.getToolDefinitions());
}

export function getOrCreateToolRegistry(senderId: number, workspaceRoot: string): ToolRegistry {
  let registry = registries.get(senderId);
  if (!registry) {
    registry = new ToolRegistry(workspaceRoot, contextEngine);
    registry.setMcpInvoker(async (serverId, toolName, args) => {
      const status = mcpManager.list().find((s) => s.id === serverId);
      const configServers = (await loadCavalConfig(workspaceRoot)).mcp?.servers ?? [];
      const serverConfig = configServers.find((s) => s.id === serverId);
      const toolDetail = status?.toolDetails?.find((t) => t.name === toolName);
      const gate = await assertMcpToolCallAllowed({
        workspaceRoot,
        serverId,
        toolName,
        args,
        serverConfig,
        inputSchema: toolDetail?.inputSchema,
      });
      if (!gate.ok) return { ok: false, error: gate.error };
      return mcpManager.callTool(serverId, toolName, args);
    });
    registries.set(senderId, registry);
  }
  syncRegistryMcpTools(registry);
  return registry;
}

/**
 * Start only LOCAL_SAFE enabled servers, or NETWORK_OR_WRITE servers that already have trust.
 * Never silently auto-starts untrusted network/write servers.
 */
export async function ensureMcpServersReady(workspaceRoot: string): Promise<void> {
  const config = await loadCavalConfig(workspaceRoot);
  mcpManager.loadFromConfig(config, workspaceRoot);

  const enabled = (config.mcp?.servers ?? []).filter((s) => s.enabled !== false);
  await Promise.all(
    enabled.map(async (server) => {
      const running = mcpManager.list().find((s) => s.id === server.id)?.running;
      if (running) return;

      const mayStart =
        isLocalSafeMcpServer(server.id) ||
        isMcpServerStartAllowed(workspaceRoot, server.id, server.command, server.args);
      if (!mayStart) {
        return;
      }
      await mcpManager.start(server.id, workspaceRoot);
    })
  );
}

export function listAvailableTools(registry: ToolRegistry): ToolDefinition[] {
  syncRegistryMcpTools(registry);
  return registry.listTools();
}
