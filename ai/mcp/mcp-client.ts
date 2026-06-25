// ──────────────────────────────────────────────
//  MCP client — minimal stdio server management
// ──────────────────────────────────────────────

import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
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

const WINDOWS_SHELL_COMMANDS = new Set(["npx", "npm", "node", "pnpm", "yarn"]);

/** Resolve spawn command for Windows (.cmd + shell) to avoid ENOENT in Electron. */
export const resolveMcpSpawn = (
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string }
): { command: string; args: string[]; options: SpawnOptions } => {
  const spawnOptions: SpawnOptions = {
    env: { ...process.env, ...options.env },
    stdio: ["pipe", "pipe", "pipe"],
    cwd: options.cwd,
  };

  if (process.platform !== "win32") {
    return { command, args, options: spawnOptions };
  }

  const base = pathBasename(command).toLowerCase().replace(/\.(cmd|exe|bat)$/i, "");
  if (WINDOWS_SHELL_COMMANDS.has(base)) {
    return {
      command: `${base}.cmd`,
      args,
      options: { ...spawnOptions, shell: true },
    };
  }

  return { command, args, options: { ...spawnOptions, shell: true } };
};

const pathBasename = (value: string): string => {
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || value;
};

const spawnMcpProcess = (
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string }
): Promise<ChildProcess> =>
  new Promise((resolve, reject) => {
    const resolved = resolveMcpSpawn(command, args, options);
    const child = spawn(resolved.command, resolved.args, resolved.options);

    const fail = (error: Error): void => {
      child.removeAllListeners();
      reject(error);
    };

    child.once("error", fail);
    child.once("spawn", () => {
      child.removeListener("error", fail);
      resolve(child);
    });
  });

export class McpClientManager {
  private servers = new Map<string, { config: McpServerConfig; process: ChildProcess | null; tools: string[]; cwd?: string }>();

  loadFromConfig(config: CavalConfig, cwd?: string): void {
    for (const server of config.mcp?.servers ?? []) {
      if (server.enabled !== false) {
        this.servers.set(server.id, { config: server, process: null, tools: [], cwd });
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

  async start(serverId: string, cwd?: string): Promise<McpServerStatus> {
    const entry = this.servers.get(serverId);
    if (!entry) return { id: serverId, name: serverId, running: false, tools: [], error: "Server not found" };

    if (entry.process && !entry.process.killed) {
      return { id: serverId, name: entry.config.name, running: true, tools: entry.tools };
    }

    const workdir = cwd ?? entry.cwd;
    if (cwd) entry.cwd = cwd;

    try {
      const child = await spawnMcpProcess(entry.config.command, entry.config.args ?? [], {
        env: entry.config.env,
        cwd: workdir,
      });

      child.on("error", () => {
        entry.process = null;
        entry.tools = [];
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
