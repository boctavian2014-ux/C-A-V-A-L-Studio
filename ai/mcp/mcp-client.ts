// ──────────────────────────────────────────────
//  MCP client — minimal stdio server management
// ──────────────────────────────────────────────

import { spawn, type ChildProcess } from "node:child_process";
import type { CavalConfig } from "../modes/agent-modes";

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface McpServerStatus {
  id: string;
  name: string;
  running: boolean;
  tools: string[];
  error?: string;
}

export class McpClientManager {
  private servers = new Map<string, { config: McpServerConfig; process: ChildProcess | null; tools: string[] }>();

  loadFromConfig(config: CavalConfig): void {
    for (const server of config.mcp?.servers ?? []) {
      if (server.enabled !== false) {
        this.servers.set(server.id, { config: server, process: null, tools: [] });
      }
    }
  }

  list(): McpServerStatus[] {
    return [...this.servers.entries()].map(([id, entry]) => ({
      id,
      name: entry.config.name,
      running: entry.process !== null && !entry.process.killed,
      tools: entry.tools,
      error: undefined,
    }));
  }

  async start(serverId: string): Promise<McpServerStatus> {
    const entry = this.servers.get(serverId);
    if (!entry) return { id: serverId, name: serverId, running: false, tools: [], error: "Server not found" };

    if (entry.process && !entry.process.killed) {
      return { id: serverId, name: entry.config.name, running: true, tools: entry.tools };
    }

    try {
      const child = spawn(entry.config.command, entry.config.args ?? [], {
        env: { ...process.env, ...entry.config.env },
        stdio: ["pipe", "pipe", "pipe"],
      });
      entry.process = child;
      entry.tools = [`mcp:${serverId}:generic`];
      return { id: serverId, name: entry.config.name, running: true, tools: entry.tools };
    } catch (error) {
      return {
        id: serverId,
        name: entry.config.name,
        running: false,
        tools: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  stop(serverId: string): void {
    const entry = this.servers.get(serverId);
    if (entry?.process && !entry.process.killed) {
      entry.process.kill();
      entry.process = null;
    }
  }

  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<{ ok: boolean; output?: unknown; error?: string }> {
    const entry = this.servers.get(serverId);
    if (!entry?.process || entry.process.killed) {
      return { ok: false, error: "MCP server not running" };
    }
    return { ok: true, output: { serverId, toolName, args, note: "MCP tool bridge placeholder" } };
  }
}

export const mcpManager = new McpClientManager();
