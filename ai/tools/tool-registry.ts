// ──────────────────────────────────────────────
//  Tool registry — agentic tools for chat/composer
// ──────────────────────────────────────────────

import fs from "node:fs/promises";
import path from "node:path";
import type { ContextEngineApi } from "../../context-engine/api";

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
];

type McpToolInvoker = (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<ToolResult>;

export class ToolRegistry {
  private mcpInvoker: McpToolInvoker | null = null;

  constructor(
    private readonly workspaceRoot: string,
    private readonly contextEngine?: ContextEngineApi
  ) {}

  setMcpInvoker(invoker: McpToolInvoker): void {
    this.mcpInvoker = invoker;
  }

  listTools(): ToolDefinition[] {
    return [...BUILTIN_TOOLS];
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    if (call.name.startsWith("mcp:")) {
      if (!this.mcpInvoker) return { ok: false, error: "MCP not configured" };
      const [, serverId, toolName] = call.name.split(":");
      return this.mcpInvoker(serverId, toolName, call.arguments);
    }

    switch (call.name) {
      case "read_file":
        return this.readFile(String(call.arguments.path ?? ""));
      case "write_file":
        return this.writeFile(String(call.arguments.path ?? ""), String(call.arguments.content ?? ""));
      case "list_dir":
        return this.listDir(String(call.arguments.path ?? "."));
      case "search_codebase":
        return this.searchCodebase(String(call.arguments.query ?? ""), Number(call.arguments.limit ?? 8));
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
}
