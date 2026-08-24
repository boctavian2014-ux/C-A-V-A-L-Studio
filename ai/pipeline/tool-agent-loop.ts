import { AIClient } from "../ai-client";
import { getModelProfile } from "../model-profiles";
import type { ToolRegistry } from "../tools/tool-registry";
import type { ChatMessage, ModelRequest } from "../types";
import { abortRegistry } from "../../src/main/abort/abort-registry";

const MAX_TOOL_STEPS = 16;
const MAX_AGENTIC_TOOL_STEPS = 48;
const ABORTED_ERROR = "Generare anulată.";

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

export function maxToolStepsForIntent(intent?: ModelRequest["intent"]): number {
  return intent === "kilocode" ? MAX_AGENTIC_TOOL_STEPS : MAX_TOOL_STEPS;
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
  parentAbortId?: string;
  signal?: AbortSignal;
  writeTurnId?: string;
}): Promise<
  | { ok: true; text: string; writtenPaths: string[] }
  | { ok: false; error: string; writtenPaths?: string[] }
> {
  const { aiClient, registry, baseRequest, initialMessages, modelId, callbacks } = input;
  const toolAbort = input.parentAbortId
    ? abortRegistry.create("tool-loop", input.parentAbortId)
    : null;
  const signal = toolAbort?.signal ?? input.signal ?? baseRequest.signal;

  try {
    return await runToolLoopBody({
      aiClient,
      registry,
      baseRequest: { ...baseRequest, signal },
      initialMessages,
      modelId,
      callbacks,
      signal,
      writeTurnId: input.writeTurnId,
    });
  } finally {
    if (toolAbort) abortRegistry.release(toolAbort.id);
  }
}

async function runToolLoopBody(input: {
  aiClient: AIClient;
  registry: ToolRegistry;
  baseRequest: ModelRequest;
  initialMessages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  modelId: string;
  callbacks?: ToolLoopCallbacks;
  signal?: AbortSignal;
  writeTurnId?: string;
}): Promise<
  | { ok: true; text: string; writtenPaths: string[] }
  | { ok: false; error: string; writtenPaths?: string[] }
> {
  const { aiClient, registry, baseRequest, initialMessages, modelId, callbacks, signal, writeTurnId } = input;
  const profile = getModelProfile(modelId);
  const tools = registry.listTools();
  const maxSteps = maxToolStepsForIntent(baseRequest.intent);

  if (signal?.aborted) {
    return { ok: false, error: ABORTED_ERROR, writtenPaths: [] };
  }

  if (!tools.length || !profile?.supportsToolCalling) {
    let full = "";
    for await (const chunk of aiClient.stream({ ...baseRequest, stream: true, signal })) {
      if (signal?.aborted) {
        return { ok: false, error: ABORTED_ERROR, writtenPaths: [] };
      }
      if (chunk.kind !== "content") continue;
      full += chunk.text;
      callbacks?.onDelta?.(chunk.text);
    }
    return { ok: true, text: full, writtenPaths: [] };
  }

  const messages: ChatMessage[] = toChatMessages(initialMessages);
  const writtenPaths: string[] = [];

  for (let step = 0; step < maxSteps; step++) {
    if (signal?.aborted) {
      return { ok: false, error: ABORTED_ERROR, writtenPaths };
    }

    const response = await aiClient.complete({
      ...baseRequest,
      messages,
      tools,
      stream: false,
      signal,
    });

    if (signal?.aborted) {
      return { ok: false, error: ABORTED_ERROR, writtenPaths };
    }

    if (!response.toolCalls?.length) {
      let text = response.content ?? "";
      if (!text.trim() && writtenPaths.length > 0) {
        text = `✓ ${writtenPaths.length} fișier(e) create în workspace.`;
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
      if (signal?.aborted) {
        return { ok: false, error: ABORTED_ERROR, writtenPaths };
      }
      callbacks?.onToolCall?.(call.name, "start");
      const result = await registry.execute(
        {
          name: call.name,
          arguments: call.arguments ?? {},
        },
        writeTurnId ? { turnId: writeTurnId } : undefined
      );

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
    const text = `✓ ${writtenPaths.length} fișier(e) create în workspace.`;
    callbacks?.onDelta?.(text);
    return { ok: true, text, writtenPaths };
  }

  return {
    ok: false,
    error: `Limită de apeluri tool atinsă (max ${maxSteps}) — retrying with code stream.`,
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
