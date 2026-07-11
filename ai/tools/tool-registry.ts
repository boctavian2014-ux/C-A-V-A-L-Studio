// ──────────────────────────────────────────────
//  Tool registry — agentic tools for chat/composer
// ──────────────────────────────────────────────

import fs from "node:fs/promises";
import path from "node:path";
import type { ContextEngineApi } from "../../context-engine/api";
import { runAllowedWorkspaceCommand } from "./workspace-command-runner";
import { runTerminalCommand } from "../../src/main/terminal-bridge";

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  ok: boolean;
  output?: unknown;
  error?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const BUILTIN_TOOLS: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read a file from the workspace",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "write_file",
    description: "Write content to a file in the workspace",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
  },
  {
    name: "list_dir",
    description: "List files in a directory",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "search_codebase",
    description: "Semantic search across the indexed codebase",
    parameters: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] },
  },
  {
    name: "run_command",
    description:
      "Run an allowed npm/git command in the workspace (e.g. npm run build, npm test). Use to verify after writing files — does not require MCP.",
    parameters: {
      type: "object",
      properties: { command: { type: "string", description: "e.g. npm run build" } },
      required: ["command"],
    },
  },
  {
    name: "run_terminal",
    description:
      "Run a shell command in the workspace terminal (caval:terminal bridge). Same allowlist as run_command.",
    parameters: {
      type: "object",
      properties: { command: { type: "string", description: "e.g. npm test" } },
      required: ["command"],
    },
  },
];

type McpToolInvoker = (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<ToolResult>;

export class ToolRegistry {
  private mcpInvoker: McpToolInvoker | null = null;
  private mcpToolDefinitions: ToolDefinition[] = [];

  constructor(
    private readonly workspaceRoot: string,
    private readonly contextEngine?: ContextEngineApi
  ) {}

  setMcpInvoker(invoker: McpToolInvoker): void {
    this.mcpInvoker = invoker;
  }

  setMcpToolDefinitions(definitions: ToolDefinition[]): void {
    this.mcpToolDefinitions = definitions;
  }

  listTools(): ToolDefinition[] {
    return [...BUILTIN_TOOLS, ...this.mcpToolDefinitions];
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    if (call.name.startsWith("mcp:")) {
      if (!this.mcpInvoker) return { ok: false, error: "MCP not configured" };
      const parsed = call.name.match(/^mcp:([^:]+):(.+)$/);
      if (!parsed) return { ok: false, error: `Invalid MCP tool name: ${call.name}` };
      const [, serverId, toolName] = parsed;
      return this.mcpInvoker(serverId!, toolName!, call.arguments);
    }

    switch (call.name) {
      case "read_file":
        return this.readFile(String(call.arguments.path ?? ""));
      case "write_file": {
        const filePath = String(
          call.arguments.path ?? call.arguments.file_path ?? call.arguments.filePath ?? ""
        );
        const content = String(
          call.arguments.content ?? call.arguments.body ?? call.arguments.code ?? call.arguments.text ?? ""
        );
        return this.writeFile(filePath, content);
      }
      case "list_dir":
        return this.listDir(String(call.arguments.path ?? "."));
      case "search_codebase":
        return this.searchCodebase(String(call.arguments.query ?? ""), Number(call.arguments.limit ?? 8));
      case "run_command":
        return this.runCommand(String(call.arguments.command ?? ""));
      case "run_terminal":
        return this.runTerminal(String(call.arguments.command ?? ""));
      default:
        return { ok: false, error: `Unknown tool: ${call.name}` };
    }
  }

  private resolvePath(relative: string): string {
    const resolved = path.isAbsolute(relative) ? relative : path.join(this.workspaceRoot, relative);
    if (!resolved.startsWith(path.resolve(this.workspaceRoot))) {
      throw new Error("Path outside workspace");
    }
    return resolved;
  }

  private async readFile(filePath: string): Promise<ToolResult> {
    try {
      const content = await fs.readFile(this.resolvePath(filePath), "utf8");
      return { ok: true, output: { path: filePath, content } };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async writeFile(filePath: string, content: string): Promise<ToolResult> {
    if (!filePath.trim()) {
      return { ok: false, error: "write_file requires path (relative to workspace root)." };
    }
    if (!content.trim()) {
      return {
        ok: false,
        error: "write_file requires non-empty content — provide the full source file, not a placeholder.",
      };
    }
    try {
      const full = this.resolvePath(filePath);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, "utf8");
      return { ok: true, output: { path: filePath, bytes: content.length } };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async listDir(dirPath: string): Promise<ToolResult> {
    try {
      const entries = await fs.readdir(this.resolvePath(dirPath), { withFileTypes: true });
      return {
        ok: true,
        output: entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() })),
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async searchCodebase(query: string, limit: number): Promise<ToolResult> {
    if (!this.contextEngine) return { ok: false, error: "Context engine not available" };
    try {
      const results = await this.contextEngine.search(query, limit);
      return { ok: true, output: results };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async runTerminal(command: string): Promise<ToolResult> {
    const result = await runTerminalCommand(this.workspaceRoot, command);
    return {
      ok: result.ok,
      output: {
        command,
        exitCode: result.exitCode,
        output: result.output,
      },
      error: result.error ?? (result.ok ? undefined : result.output.slice(0, 500)),
    };
  }

  private async runCommand(command: string): Promise<ToolResult> {
    if (!command.trim()) {
      return { ok: false, error: "run_command requires command (e.g. npm run build)." };
    }
    try {
      const result = await runAllowedWorkspaceCommand(command, this.workspaceRoot);
      return {
        ok: result.ok,
        output: {
          command: result.command,
          exitCode: result.exitCode,
          output: result.output,
        },
        error: result.ok ? undefined : result.output.slice(0, 500),
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
