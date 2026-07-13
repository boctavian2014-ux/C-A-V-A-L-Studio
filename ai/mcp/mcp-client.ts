import { execSync } from "child_process";
import os from "os";
import path from "path";
import type { ToolDefinition } from "../tools/tool-registry";
import { mergeMcpServerEnv } from "./mcp-env";
import { resolveMcpServerArgs, isGitRepository } from "./mcp-workspace-args";
import { mcpToolId } from "./mcp-tool-names";

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface McpToolInfo {
  serverId: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpServerStatus {
  id: string;
  name: string;
  running: boolean;
  tools: string[];
  toolDetails: McpToolInfo[];
  error?: string;
}

/** npm/pnpm/yarn ship .cmd shims on Windows; uv/docker/trivy are native .exe. */
const WINDOWS_CMD_SHIMS = new Set(["npx", "npm", "pnpm", "yarn"]);

const augmentWindowsPath = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const home = os.homedir();
  const candidates = [
    path.join(home, ".local", "bin"),
    path.join(process.env.APPDATA ?? "", "npm"),
    path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Python", "Python313", "Scripts"),
    path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Python", "Python312", "Scripts"),
  ];
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const current = env[pathKey] ?? "";
  const lower = current.toLowerCase();
  const extra = candidates.filter((dir) => dir && !lower.includes(dir.toLowerCase()));
  if (extra.length === 0) return env;
  return { ...env, [pathKey]: [...extra, current].filter(Boolean).join(path.delimiter) };
};

const resolveWindowsExecutable = (command: string, env: NodeJS.ProcessEnv): string => {
  const base =
    command.replace(/\\/g, "/").split("/").pop()?.toLowerCase().replace(/\.(cmd|exe|bat)$/i, "") ?? command;

  if (WINDOWS_CMD_SHIMS.has(base)) {
    return `${base}.cmd`;
  }

  if (command.includes(path.sep) || command.includes("/")) {
    return command;
  }

  try {
    const located = execSync(`where.exe ${base}`, {
      encoding: "utf8",
      env,
      windowsHide: true,
      timeout: 5000,
    }).trim();
    const first = located.split(/\r?\n/)[0]?.trim();
    if (first) return first;
  } catch {
    // fall through to bare command (PATHEXT may still resolve .exe)
  }

  return command;
};

export const resolveMcpSpawn = (
  command: string,
  args: string[],
  options: { env?: Record<string, string>; cwd?: string; secrets?: Record<string, string> }
): { command: string; args: string[]; env: NodeJS.ProcessEnv; cwd?: string } => {
  let env = mergeMcpServerEnv(options.env, options.secrets);
  if (process.platform !== "win32") {
    return { command, args, env, cwd: options.cwd };
  }

  env = augmentWindowsPath(env);
  const resolvedCommand = resolveWindowsExecutable(command, env);
  return { command: resolvedCommand, args, env, cwd: options.cwd };
};

interface ServerEntry {
  config: McpServerConfig;
  client: unknown;
  transport: unknown;
  tools: McpToolInfo[];
  cwd?: string;
  error?: string;
  stderrTail: string;
}

function toolDefinitionsFromMcp(serverId: string, tools: McpToolInfo[]): ToolDefinition[] {
  return tools.map((tool) => ({
    name: mcpToolId(serverId, tool.name),
    description: tool.description || `MCP tool ${tool.name} (${serverId})`,
    parameters: tool.inputSchema,
  }));
}

function extractCallToolOutput(result: unknown): { ok: boolean; output?: unknown; error?: string } {
  if (!result || typeof result !== "object") {
    return { ok: true, output: result };
  }

  const payload = result as {
    content?: Array<{ type: string; text?: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
    toolResult?: unknown;
  };

  if ("toolResult" in payload && payload.toolResult !== undefined) {
    return { ok: true, output: payload.toolResult };
  }

  if (payload.isError) {
    const text = payload.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");
    return { ok: false, error: text || "MCP tool returned an error" };
  }

  if (payload.structuredContent) {
    return { ok: true, output: payload.structuredContent };
  }

  const text = payload.content
    ?.filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
  if (text) return { ok: true, output: text };
  if (payload.content?.length) return { ok: true, output: payload.content };
  return { ok: true, output: null };
}

export class McpClientManager {
  private servers = new Map<string, ServerEntry>();
  private secretsProvider: () => Record<string, string> = () => ({});

  setSecretsProvider(provider: () => Record<string, string>): void {
    this.secretsProvider = provider;
  }

  loadFromConfig(
    config: { mcp?: { servers?: McpServerConfig[] } },
    cwd?: string
  ): void {
    const configIds = new Set((config.mcp?.servers ?? []).map((s) => s.id));

    for (const id of [...this.servers.keys()]) {
      if (!configIds.has(id)) {
        this.stop(id);
        this.servers.delete(id);
      }
    }

    for (const server of config.mcp?.servers ?? []) {
      const existing = this.servers.get(server.id);
      if (existing) {
        existing.config = server;
        if (cwd) existing.cwd = cwd;
      } else {
        this.servers.set(server.id, {
          config: server,
          client: null,
          transport: null,
          tools: [],
          cwd,
          stderrTail: "",
        });
      }
    }
  }

  list(): McpServerStatus[] {
    return [...this.servers.entries()].map(([id, entry]) => ({
      id,
      name: entry.config.name,
      running: entry.client !== null,
      tools: entry.tools.map((t) => mcpToolId(id, t.name)),
      toolDetails: entry.tools.map((t) => ({ ...t, serverId: id })),
      error: entry.error,
    }));
  }

  getToolDefinitions(): ToolDefinition[] {
    const defs: ToolDefinition[] = [];
    for (const [serverId, entry] of this.servers) {
      if (!entry.client) continue;
      defs.push(...toolDefinitionsFromMcp(serverId, entry.tools));
    }
    return defs;
  }

  hasRunningServers(): boolean {
    return [...this.servers.values()].some((e) => e.client !== null);
  }

  async start(serverId: string, cwd?: string): Promise<McpServerStatus> {
    const entry = this.servers.get(serverId);
    if (!entry) {
      return {
        id: serverId,
        name: serverId,
        running: false,
        tools: [],
        toolDetails: [],
        error: "Server not found in caval.jsonc",
      };
    }

    if (entry.client) {
      return this.statusForEntry(serverId, entry);
    }

    const workdir = cwd ?? entry.cwd;
    if (cwd) entry.cwd = cwd;
    entry.error = undefined;
    entry.stderrTail = "";

    if (serverId === "git" && workdir && !isGitRepository(workdir)) {
      entry.error = `${workdir} is not a valid Git repository`;
      return {
        id: serverId,
        name: entry.config.name,
        running: false,
        tools: [],
        toolDetails: [],
        error: entry.error,
      };
    }

    try {
      const resolvedArgs = resolveMcpServerArgs(entry.config.args, workdir);
      const spawn = resolveMcpSpawn(entry.config.command, resolvedArgs, {
        env: entry.config.env,
        cwd: workdir,
        secrets: this.secretsProvider(),
      });

      const [{ Client }, { StdioClientTransport }] = await Promise.all([
        import("@modelcontextprotocol/sdk/client"),
        import("@modelcontextprotocol/sdk/client/stdio.js"),
      ]);

      const transport = new StdioClientTransport({
        command: spawn.command,
        args: spawn.args,
        env: spawn.env as Record<string, string>,
        cwd: spawn.cwd,
        stderr: "pipe",
      });

      const stderrStream = (transport as { stderr?: NodeJS.ReadableStream | null }).stderr;
      if (stderrStream && "on" in stderrStream) {
        stderrStream.on("data", (chunk: Buffer | string) => {
          entry.stderrTail = `${entry.stderrTail}${chunk.toString()}`.slice(-4000);
        });
      }

      const client = new Client({ name: "caval-studio", version: "0.1.0" });
      await client.connect(transport);

      const listed = await client.listTools();
      entry.tools = (listed.tools ?? []).map((tool) => ({
        serverId,
        name: tool.name,
        description: tool.description ?? "",
        inputSchema: (tool.inputSchema as Record<string, unknown>) ?? {
          type: "object",
          properties: {},
        },
      }));

      entry.client = client;
      entry.transport = transport;

      (transport as { onclose?: () => void }).onclose = () => {
        entry.client = null;
        entry.transport = null;
        entry.tools = [];
      };

      return this.statusForEntry(serverId, entry);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      entry.error = entry.stderrTail ? `${message}\n${entry.stderrTail}` : message;
      entry.client = null;
      entry.transport = null;
      entry.tools = [];
      return {
        id: serverId,
        name: entry.config.name,
        running: false,
        tools: [],
        toolDetails: [],
        error: entry.error,
      };
    }
  }

  stop(serverId: string): void {
    const entry = this.servers.get(serverId);
    if (!entry) return;

    void (entry.transport as { close?: () => Promise<void> } | null)?.close?.().catch(() => undefined);
    entry.client = null;
    entry.transport = null;
    entry.tools = [];
  }

  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ ok: boolean; output?: unknown; error?: string }> {
    const entry = this.servers.get(serverId);
    if (!entry?.client) {
      return { ok: false, error: "MCP server not running" };
    }

    try {
      const client = entry.client as {
        callTool: (params: { name: string; arguments: Record<string, unknown> }) => Promise<unknown>;
      };
      const result = await client.callTool({ name: toolName, arguments: args });
      return extractCallToolOutput(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  }

  private statusForEntry(serverId: string, entry: ServerEntry): McpServerStatus {
    return {
      id: serverId,
      name: entry.config.name,
      running: entry.client !== null,
      tools: entry.tools.map((t) => mcpToolId(serverId, t.name)),
      toolDetails: entry.tools.map((t) => ({ ...t, serverId })),
      error: entry.error,
    };
  }
}

export const mcpManager = new McpClientManager();
