import { ipcMain, type WebContents } from "electron";

import { buildModelCatalog, invalidateCatalogCache } from "../../ai/models/model-catalog";
import { warmOpenRouterConnection } from "../../ai/models/openrouter-warm";

import { clearOpenRouterCache } from "../../ai/models/openrouter-catalog";

import { resolveModelSelection } from "../../ai/models/auto-router";

import {

  completeModelText,

  executeModelCompletion,

  type CompleteModelTextInput,

} from "../../ai/pipeline/model-completion";

import type { RoutingIntent } from "../../ai/types";

import type { ApiKeys } from "../../ai/multi-model/provider";
import { ensureMcpServersReady, getOrCreateToolRegistry } from "./mcp-handlers";
import { formatToolCallNotice } from "../../ai/pipeline/tool-agent-loop";
import { enrichChatWithZeroLatency } from "./zl-handlers";
import type { ChatActivityPhase } from "../../ai/composer/chat-activity-types";
import { REASONING_CHAT_ADDON } from "../../ai/prompts/reasoning-layer";
import { CODING_ARENA_SYSTEM_PROMPT } from "../../ai/prompts/coding-arena";
import {
  buildMultiModelSystemPrompt,
  MULTI_MODEL_RECAP_ADDON,
} from "../../ai/prompts/multi-model-reasoning-chat";
import {
  runCavalloMultiAgentPipeline,
  shouldUseMultiAgentPipeline,
  abortMultiAgentPipeline,
} from "../../ai/composer/multi-agent";



export interface ChatStreamMessage {

  role: "system" | "user" | "assistant";

  content: string;

}



export interface CavalChatStreamRequest {

  message: string;

  model: string;

  mode?: "ask" | "plan" | "code" | "architect" | "debug";

  intent?: RoutingIntent;

  streamId: string;

  workspaceRoot?: string;

  messages?: ChatStreamMessage[];

  context?: {

    filePath?: string;

    fileContent?: string;

    projectContext?: string;

    mentions?: string[];

    attachments?: Array<{ path: string; name: string; content: string }>;

  };

  /** Force OpenRouter json_object — used by Engineering AI */
  jsonMode?: boolean;

  maxTokens?: number;

  temperature?: number;

  timeoutMs?: number;

  /** Greenfield / Engineering handoff — must write files via tools */
  scaffoldMode?: boolean;

  /** Skip multi-agent pipeline — use single-call Balanced Mode */
  skipMultiAgent?: boolean;

  /** Force merge + supervisor review (overrides fastPipeline from caval.jsonc) */
  strictReview?: boolean;

}



export interface CavalAiCompleteRequest {

  model: string;

  intent?: RoutingIntent;

  capability?: CompleteModelTextInput["capability"];

  messages: ChatStreamMessage[];

  workspaceRoot?: string;

  requestId?: string;

  apiKeys?: ApiKeys;

  jsonMode?: boolean;

  maxTokens?: number;

  temperature?: number;

  timeoutMs?: number;

}



function modeToIntent(mode?: string): RoutingIntent {

  switch (mode) {

    case "plan":

    case "architect":

      return "planning";

    case "debug":

      return "debug";

    case "code":

      return "kilocode";

    default:

      return "fallback";

  }

}



function capabilityForMode(mode?: string): CompleteModelTextInput["capability"] {

  if (mode === "plan" || mode === "architect") return "planning";

  if (mode === "debug") return "debug";

  if (mode === "code") return "code";

  return "chat";

}



function systemPromptForMode(mode?: string): string {
  switch (mode) {
    case "code":
      return CODING_ARENA_SYSTEM_PROMPT;
    case "plan":
    case "architect":
      return `${buildMultiModelSystemPrompt({ agentMode: mode })}${MULTI_MODEL_RECAP_ADDON}\n\nFocus: structured plans before code changes. Use Technical Mode Steps 1–4.`;
    case "debug":
      return `${buildMultiModelSystemPrompt({ agentMode: mode })}${MULTI_MODEL_RECAP_ADDON}\n\nFocus: analyze errors, trace root causes, suggest fixes. Technical Mode.`;
    default:
      return `${buildMultiModelSystemPrompt({ agentMode: mode ?? "ask" })}${MULTI_MODEL_RECAP_ADDON}`;
  }
}



function wrapUserMessage(message: string): string {

  return `<<USER_MESSAGE>>\n${message}\n<</USER_MESSAGE>>`;

}



function buildUserContent(request: CavalChatStreamRequest): string {

  const parts = [wrapUserMessage(request.message)];

  if (request.context?.filePath) {

    parts.push(`\nActive file: ${request.context.filePath}`);

  }

  if (request.context?.fileContent) {

    parts.push(

      `\n<<FILE_CONTEXT path="${request.context.filePath ?? "unknown"}">>\n${request.context.fileContent.slice(0, 16_000)}\n<</FILE_CONTEXT>>`

    );

  }

  if (request.context?.projectContext) {

    parts.push(

      `\n<<PROJECT_CONTEXT>>\n${request.context.projectContext.slice(0, 12_000)}\n<</PROJECT_CONTEXT>>`

    );

  }

  if (request.context?.mentions?.length) {

    parts.push(`\nReferenced files: ${request.context.mentions.join(", ")}`);

  }

  if (request.context?.attachments?.length) {

    for (const file of request.context.attachments) {

      parts.push(

        `\n<<ATTACHMENT path="${file.path}" name="${file.name}">>\n${file.content.slice(0, 16_000)}\n<</ATTACHMENT>>`

      );

    }

  }

  return parts.join("");

}



function scaffoldSystemAddon(): string {
  return [
    "",
    "SCAFFOLD MODE:",
    "- Create a minimal but runnable project structure under the workspace root.",
    "- Output each file as a fenced block: ```lang:relative/path with FULL source.",
    "- Include README.md, docs/requirements.md, docs/architecture.md for complex projects.",
    "- Include tests, CI/CD configs (Dockerfile, .github/workflows), deployment notes when relevant.",
    "- Prefer 5–15 real files over chat prose; stop when files exist; do not repeat the spec.",
    REASONING_CHAT_ADDON,
  ].join("\n");
}

function buildMessages(request: CavalChatStreamRequest): ChatStreamMessage[] {

  let system = systemPromptForMode(request.mode);
  if (request.mode === "code" && request.workspaceRoot) {
    system += scaffoldSystemAddon();
  } else if (request.scaffoldMode && request.mode === "code") {
    system += scaffoldSystemAddon();
  }



  if (request.messages?.length) {

    const msgs = request.messages.map((m) => ({ ...m }));

    const hasSystem = msgs.some((m) => m.role === "system");

    if (!hasSystem) {

      msgs.unshift({ role: "system", content: system });

    }

    const lastUserIdx = [...msgs].reverse().findIndex((m) => m.role === "user");

    if (lastUserIdx >= 0) {

      const idx = msgs.length - 1 - lastUserIdx;

      const attachmentBlock = request.context?.attachments?.length

        ? request.context.attachments

            .map(

              (f) =>

                `\n<<ATTACHMENT path="${f.path}" name="${f.name}">>\n${f.content}\n<</ATTACHMENT>>`

            )

            .join("")

        : "";

      if (attachmentBlock && !msgs[idx]!.content.includes("<<ATTACHMENT")) {

        msgs[idx] = {

          ...msgs[idx]!,

          content: `${msgs[idx]!.content}${attachmentBlock}`,

        };

      }

    }

    return msgs;

  }



  return [

    { role: "system", content: system },

    { role: "user", content: buildUserContent(request) },

  ];

}



function toCompletionInput(request: CavalChatStreamRequest): CompleteModelTextInput {

  return {

    model: request.model,

    intent: request.intent ?? modeToIntent(request.mode),

    capability: capabilityForMode(request.mode),

    messages: buildMessages(request),

    workspaceRoot: request.workspaceRoot,

    requestId: request.streamId,

    jsonMode: request.jsonMode,

    maxTokens: request.maxTokens ?? (request.mode === "code" ? 8192 : undefined),

    temperature: request.temperature,

    timeoutMs: request.timeoutMs ?? (request.jsonMode ? 120_000 : undefined),

  };

}



function chatPanelUsesTools(mode?: string, workspaceRoot?: string, model?: string): boolean {
  if (mode !== "code" || !workspaceRoot?.trim()) return false;
  // Auto Free / local: tools → list_dir loops, no write_file — use code fences instead.
  if (!model || model.startsWith("caval-auto/") || model === "ollama-local") return false;
  return true;
}

function agentCompleteUsesTools(model: string): boolean {
  if (model === "caval-auto/free" || model === "ollama-local") return false;
  return true;
}

function sendStatusChunk(
  sender: WebContents,
  streamId: string,
  phase: ChatActivityPhase,
  status: "active" | "done",
  detail?: string
): void {
  sender.send("caval:ai-stream-chunk", {
    streamId,
    type: "status",
    phase,
    status,
    detail,
  });
}

function sendMultiAgentStatusChunk(
  sender: WebContents,
  streamId: string,
  phase: import("../../ai/composer/chat-activity-types").MultiAgentPhase,
  status: "active" | "done",
  detail?: string
): void {
  sender.send("caval:ai-stream-chunk", {
    streamId,
    type: "multiagent",
    multiAgentPhase: phase,
    status,
    detail,
  });
}

function sendReasoningBriefChunk(
  sender: WebContents,
  streamId: string,
  brief: { goal: string; approach: string; modules: string[] }
): void {
  sender.send("caval:ai-stream-chunk", {
    streamId,
    type: "reasoning-brief",
    goal: brief.goal,
    approach: brief.approach,
    modules: brief.modules,
  });
}

async function streamToRenderer(
  sender: WebContents,
  senderId: number,
  streamId: string,
  request: CavalChatStreamRequest,
  getWorkspaceRoot: (senderId: number) => string
): Promise<void> {
  const workspaceRoot = request.workspaceRoot ?? getWorkspaceRoot(senderId);

  const useMultiAgent =
    !request.skipMultiAgent &&
    shouldUseMultiAgentPipeline(request.mode, request.message, workspaceRoot);

  if (useMultiAgent) {
    sendStatusChunk(sender, streamId, "prepare", "done");
    sendStatusChunk(sender, streamId, "route", "active");
    sendMultiAgentStatusChunk(sender, streamId, "context", "active", "pipeline start");

    const result = await runCavalloMultiAgentPipeline(sender, streamId, request, {
      onMultiAgentStatus: (phase, status, detail) => {
        sendMultiAgentStatusChunk(sender, streamId, phase, status, detail);
      },
      onReasoningBrief: (brief) => {
        sendReasoningBriefChunk(sender, streamId, brief);
      },
      onMeta: (resolvedModel, reason) => {
        sender.send("caval:ai-stream-chunk", {
          streamId,
          type: "meta",
          resolvedModel,
          reason,
        });
      },
      onDelta: (delta) => {
        sender.send("caval:ai-stream-chunk", { streamId, type: "delta", delta });
      },
      onReasoning: (reasoningDelta) => {
        sender.send("caval:ai-stream-chunk", { streamId, type: "reasoning", reasoningDelta });
      },
      onStatus: (phase, status, detail) => {
        sendStatusChunk(sender, streamId, phase, status, detail);
      },
    });

    if (result.ok) {
      if (result.text?.includes('```')) {
        sender.send("caval:ai-stream-chunk", {
          streamId,
          type: "delta",
          delta: result.text,
        });
      }
      sender.send("caval:ai-stream-chunk", {
        streamId,
        type: "done",
        model: result.resolvedModel,
        provider: result.provider,
        reasoningBrief: result.reasoningBrief,
        pipelineRecapMeta: result.pipelineRecapMeta,
        composeText: result.text,
      });
      return;
    }

    sender.send("caval:ai-stream-chunk", {
      streamId,
      type: "error",
      error: result.error ?? "Multi-agent pipeline failed",
    });
    return;
  }

  const fusedRequest =
    request.jsonMode || (request.context?.fileContent?.length ?? 0) > 400
      ? request
      : enrichChatWithZeroLatency(request, workspaceRoot);

  const useTools = chatPanelUsesTools(fusedRequest.mode, workspaceRoot, fusedRequest.model);
  if (useTools) {
    void ensureMcpServersReady(workspaceRoot).catch(() => undefined);
  }

  const toolRegistry = useTools
    ? getOrCreateToolRegistry(senderId, workspaceRoot)
    : undefined;

  const completionInput: CompleteModelTextInput = {
    ...toCompletionInput(fusedRequest),
    toolRegistry,
    useTools,
    workspaceRoot,
  };

  sendStatusChunk(sender, streamId, "prepare", "done");
  sendStatusChunk(sender, streamId, "route", "active");

  const result = await executeModelCompletion(completionInput, {
    onMeta: (resolvedModel, reason) => {
      sender.send("caval:ai-stream-chunk", {
        streamId,
        type: "meta",
        resolvedModel,
        reason,
      });
    },
    onDelta: (delta) => {
      sender.send("caval:ai-stream-chunk", { streamId, type: "delta", delta });
    },
    onReasoning: (reasoningDelta) => {
      sender.send("caval:ai-stream-chunk", { streamId, type: "reasoning", reasoningDelta });
    },
    onStatus: (phase, status, detail) => {
      sendStatusChunk(sender, streamId, phase, status, detail);
    },
    onToolCall: (toolName, status, detail, writtenPath) => {
      const isCodeMode = fusedRequest.mode === "code";
      if (!isCodeMode) {
        const notice = formatToolCallNotice(toolName, status, detail);
        if (notice) {
          sender.send("caval:ai-stream-chunk", { streamId, type: "delta", delta: notice });
        }
      } else if (status === "error" && detail) {
        sender.send("caval:ai-stream-chunk", {
          streamId,
          type: "delta",
          delta: `\n⚠ ${toolName}: ${detail.slice(0, 120)}\n`,
        });
      } else if (status === "done" && toolName === "write_file" && writtenPath) {
        sendStatusChunk(sender, streamId, "write", "active", writtenPath);
      }
      sender.send("caval:ai-stream-chunk", {
        streamId,
        type: "tool",
        toolName,
        toolStatus: status,
        toolDetail: detail,
        toolWrittenPath: writtenPath,
      });
    },
  });



  if (result.ok) {

    sender.send("caval:ai-stream-chunk", {

      streamId,

      type: "done",

      model: result.resolvedModel,

      provider: result.provider,

    });

    return;

  }



  sender.send("caval:ai-stream-chunk", {

    streamId,

    type: "error",

    error: result.error,

  });

}



export function registerModelHandlers(getWorkspaceRoot: (senderId: number) => string = () => process.cwd()): void {

  ipcMain.handle("caval:models-list", async () => {

    const catalog = await buildModelCatalog(false);

    return { ok: true, catalog };

  });



  ipcMain.handle("caval:models-refresh", async () => {

    invalidateCatalogCache();

    clearOpenRouterCache();

    const catalog = await buildModelCatalog(true);

    return { ok: true, catalog };

  });



  ipcMain.handle("caval:ai-chat-stream", async (event, request: CavalChatStreamRequest) => {
    warmOpenRouterConnection();
    void streamToRenderer(event.sender, event.sender.id, request.streamId, request, getWorkspaceRoot);
    return { ok: true, started: true };
  });

  ipcMain.handle("caval:ai-stream-abort", async (_event, streamId: string) => {
    abortMultiAgentPipeline(streamId);
    return { ok: true };
  });



  ipcMain.handle("caval:ai-complete", async (event, input: CavalAiCompleteRequest) => {
    try {
      const workspaceRoot = input.workspaceRoot ?? getWorkspaceRoot(event.sender.id);
      void ensureMcpServersReady(workspaceRoot).catch(() => undefined);
      const toolRegistry = getOrCreateToolRegistry(event.sender.id, workspaceRoot);
      return await completeModelText({
        ...input,
        workspaceRoot,
        toolRegistry,
        useTools: input.jsonMode ? false : agentCompleteUsesTools(input.model),
      });
    } catch (error) {

      const message = error instanceof Error ? error.message : String(error);

      return { ok: false as const, error: message };

    }

  });



  ipcMain.handle("caval:resolve-model", async (_event, input: { model: string; intent?: RoutingIntent }) => {

    const resolved = await resolveModelSelection(input.model, input.intent ?? "kilocode");

    return { ok: true, resolved };

  });

}


