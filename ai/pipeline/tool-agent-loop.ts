import { AIClient } from "../ai-client";
import { getModelProfile } from "../model-profiles";
import type { ToolRegistry } from "../tools/tool-registry";
import type { ChatMessage, ModelRequest } from "../types";

const MAX_TOOL_STEPS = 16;

export interface ToolLoopCallbacks {
  onMeta?: (resolvedModel: string, reason: string) => void;
  onDelta?: (delta: string) => void;
  onToolCall?: (
    toolName: string,
    status: "start" | "done" | "error",
    detail?: string,
    writtenPath?: string
  ) => void;
}

function toChatMessages(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
): ChatMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

function stringifyToolOutput(output: unknown): string {
  if (typeof output === "string") return output;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

export async function runCompletionWithTools(input: {
  aiClient: AIClient;
  registry: ToolRegistry;
  baseRequest: ModelRequest;
  initialMessages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  modelId: string;
  callbacks?: ToolLoopCallbacks;
}): Promise<
  | { ok: true; text: string; writtenPaths: string[] }
  | { ok: false; error: string; writtenPaths?: string[] }
> {
  const { aiClient, registry, baseRequest, initialMessages, modelId, callbacks } = input;
  const profile = getModelProfile(modelId);
  const tools = registry.listTools();

  if (!tools.length || !profile?.supportsToolCalling) {
    let full = "";
    for await (const chunk of aiClient.stream({ ...baseRequest, stream: true })) {
      if (chunk.kind !== "content") continue;
      full += chunk.text;
      callbacks?.onDelta?.(chunk.text);
    }
    return { ok: true, text: full, writtenPaths: [] };
  }

  const messages: ChatMessage[] = toChatMessages(initialMessages);
  const writtenPaths: string[] = [];

  for (let step = 0; step < MAX_TOOL_STEPS; step++) {
    const response = await aiClient.complete({
      ...baseRequest,
      messages,
      tools,
      stream: false,
    });

    if (!response.toolCalls?.length) {
      let text = response.content ?? "";
      if (!text.trim() && writtenPaths.length > 0) {
        text = `✓ ${writtenPaths.length} fișier(e) create: ${writtenPaths.slice(-5).join(", ")}`;
      }
      if (writtenPaths.length === 0) {
        return {
          ok: false,
          error: "Tool loop ended without write_file — retrying with code stream.",
          writtenPaths,
        };
      }
      if (text) callbacks?.onDelta?.(text);
      return { ok: true, text, writtenPaths };
    }

    messages.push({
      role: "assistant",
      content: response.content ?? "",
      tool_calls: response.toolCalls.map((call) => ({
        id: call.id,
        type: "function" as const,
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments ?? {}),
        },
      })),
    });

    for (const call of response.toolCalls) {
      callbacks?.onToolCall?.(call.name, "start");
      const result = await registry.execute({
        name: call.name,
        arguments: call.arguments ?? {},
      });

      const toolContent = result.ok
        ? stringifyToolOutput(result.output)
        : `Error: ${result.error ?? "unknown"}`;

      const writtenPath =
        call.name === "write_file" && result.ok
          ? String(
              (result.output as { path?: string } | undefined)?.path ??
                call.arguments.path ??
                call.arguments.file_path ??
                ""
            )
          : undefined;
      if (writtenPath) writtenPaths.push(writtenPath);

      callbacks?.onToolCall?.(
        call.name,
        result.ok ? "done" : "error",
        toolContent.slice(0, 400),
        writtenPath || undefined
      );

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: toolContent,
      });
    }
  }

  if (writtenPaths.length > 0) {
    const text = `✓ ${writtenPaths.length} fișier(e) create: ${writtenPaths.slice(-5).join(", ")}`;
    callbacks?.onDelta?.(text);
    return { ok: true, text, writtenPaths };
  }

  return {
    ok: false,
    error: `Limită de apeluri tool atinsă (max ${MAX_TOOL_STEPS}) — retrying with code stream.`,
    writtenPaths,
  };
}

export function formatToolCallNotice(
  toolName: string,
  status: "start" | "done" | "error",
  detail?: string
): string {
  const label = toolName.replace(/^mcp:[^:]+:/, "");
  if (status === "start") return `\n\n🔧 *${label}*…\n`;
  if (status === "error") return `\n⚠ Tool ${label}: ${detail ?? "eroare"}\n`;
  return "";
}
