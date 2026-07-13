import fs from "node:fs";
import path from "node:path";

import { ipcMain, type WebContents } from "electron";

import { buildModelCatalog, invalidateCatalogCache } from "../../ai/models/model-catalog";
import { buildModelsHealthSnapshot } from "../../ai/models/model-health";
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
import { SCAFFOLD_EMISSION_RULE } from "../../ai/prompts/scaffold-emission-rule";
import { CODING_ARENA_SYSTEM_PROMPT } from "../../ai/prompts/coding-arena";
import { getCavalloSystemPrompt } from "../../ai/modes/mode-router";
import { isDirectChatMode } from "../../ai/modes/intent-detector";
import {
  runCavalloMultiAgentPipeline,
  resumeCavalloMultiAgentPipeline,
  shouldUseMultiAgentPipeline,
  abortMultiAgentPipeline,
} from "../../ai/composer/multi-agent";
import { loadReasoningConfig } from "../../ai/composer/multi-agent/config";
import {
  buildWorkspaceBootstrap,
  mergeProjectContextWithBootstrap,
} from "../../ai/context/workspace-bootstrap";
import { WORKSPACE_BOOTSTRAP_MARKER } from "../../ai/context/workspace-bootstrap-shared";
import { runWorkspaceVerify, runWorkspaceVerifyWithAutoFix } from "../../ai/tools/workspace-verify";



export interface ChatStreamMessage {

  role: "system" | "user" | "assistant";

  content: string;

}



export interface CavalChatStreamRequest {

  message: string;

  model: string;

  mode?: "ask" | "plan" | "code" | "agentic" | "debug" | "architect";

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

    case "agentic":

      return "kilocode";

    default:

      return "fallback";

  }

}



function capabilityForMode(mode?: string): CompleteModelTextInput["capability"] {

  if (mode === "plan" || mode === "architect") return "planning";

  if (mode === "debug") return "debug";

  if (mode === "code" || mode === "agentic") return "code";

  return "chat";

}



function systemPromptForMode(mode?: string, workspaceRoot?: string): string {
  if (mode === "agentic") {
    return CODING_ARENA_SYSTEM_PROMPT;
  }

  const normalized =
    mode === "architect" ? "plan" : mode === "ask" || mode === "plan" || mode === "code" || mode === "debug"
      ? mode
      : "ask";

  return getCavalloSystemPrompt(normalized, {
    workspaceRoot,
    includeScaffold: normalized === "code" || normalized === "debug",
  });
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
    SCAFFOLD_EMISSION_RULE,
    REASONING_CHAT_ADDON,
  ].join("\n");
}

function injectProjectContextIntoMessages(
  msgs: ChatStreamMessage[],
  projectContext: string
): ChatStreamMessage[] {
  const ctx = projectContext.trim();
  if (!ctx) return msgs;

  const alreadyPresent = msgs.some(
    (m) =>
      m.content.includes("<<PROJECT_CONTEXT>>") ||
      m.content.includes("Context proiect") ||
      m.content.includes(WORKSPACE_BOOTSTRAP_MARKER)
  );
  if (alreadyPresent) return msgs;

  const block = `Context proiect (automat):\n${ctx.slice(0, 12_000)}`;
  const lastUserRev = [...msgs].reverse().findIndex((m) => m.role === "user");
  if (lastUserRev < 0) {
    return [...msgs, { role: "user", content: block }];
  }
  const insertAt = msgs.length - 1 - lastUserRev;
  return [...msgs.slice(0, insertAt), { role: "user", content: block }, ...msgs.slice(insertAt)];
}

function buildMessages(request: CavalChatStreamRequest): ChatStreamMessage[] {

  let system = systemPromptForMode(request.mode, request.workspaceRoot);
  if (request.mode === "agentic" && request.workspaceRoot) {
    system += scaffoldSystemAddon();
  } else if (request.scaffoldMode && request.mode === "agentic") {
    system += scaffoldSystemAddon();
  }



  if (request.messages?.length) {

    const msgs = request.messages.map((m) => ({ ...m }));

    const hasSystem = msgs.some((m) => m.role === "system");
    const directChatMode =
      request.mode === "architect"
        ? "plan"
        : isDirectChatMode(request.mode ?? "")
          ? request.mode
          : null;

    if (!hasSystem) {
      msgs.unshift({ role: "system", content: system });
    } else if (directChatMode) {
      const sysIdx = msgs.findIndex((m) => m.role === "system");
      if (sysIdx >= 0) {
        msgs[sysIdx] = {
          ...msgs[sysIdx]!,
          content: systemPromptForMode(directChatMode, request.workspaceRoot),
        };
      }
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

    const withContext = injectProjectContextIntoMessages(
      msgs,
      request.context?.projectContext ?? ""
    );

    if (request.workspaceRoot) {
      const sysIdx = withContext.findIndex((m) => m.role === "system");
      if (sysIdx >= 0 && !withContext[sysIdx]!.content.includes("Workspace:")) {
        withContext[sysIdx] = {
          ...withContext[sysIdx]!,
          content: `${withContext[sysIdx]!.content}\n\nWorkspace: ${request.workspaceRoot}`,
        };
      }
    }

    return withContext;

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
  if (!workspaceRoot?.trim()) return false;
  if (mode !== "code" && mode !== "debug") return false;
  if (!model || model === "ollama-local") return false;
  if (model.startsWith("caval-auto/free")) return false;
  return true;
}

async function resolveEffectiveChatModel(model: string, mode?: string): Promise<string> {
  if (!model.startsWith("caval-auto/")) return model;
  try {
    const resolved = await resolveModelSelection(model, modeToIntent(mode));
    return resolved.modelId;
  } catch {
    return model;
  }
}

function agentCompleteUsesTools(model: string): boolean {
  if (model === "caval-auto/free" || model === "ollama-local") return false;
  return true;
}

type StreamChunkSender = {
  send: (chunk: Record<string, unknown>) => boolean;
  isAlive: () => boolean;
};

function createStreamChunkSender(
  sender: WebContents,
  senderId: number,
  streamId: string
): StreamChunkSender {
  let alive = true;
  const send = (chunk: Record<string, unknown>): boolean => {
    if (!alive) return false;
    if (sender.isDestroyed()) {
      alive = false;
      abortMultiAgentPipeline(streamId);
      return false;
    }
    try {
      sender.send("caval:ai-stream-chunk", { streamId, ...chunk });
      return true;
    } catch {
      alive = false;
      abortAllStreamsForSender(senderId);
      return false;
    }
  };
  return { send, isAlive: () => alive };
}

function sendStatusChunk(
  stream: StreamChunkSender,
  phase: ChatActivityPhase,
  status: "active" | "done",
  detail?: string
): boolean {
  return stream.send({ type: "status", phase, status, detail });
}

function sendMultiAgentStatusChunk(
  stream: StreamChunkSender,
  phase: import("../../ai/composer/chat-activity-types").MultiAgentPhase,
  status: "active" | "done",
  detail?: string,
  modelId?: string,
  stepId?: string
): boolean {
  return stream.send({
    type: "multiagent",
    multiAgentPhase: phase,
    status,
    detail,
    multiAgentModel: modelId,
    multiAgentStepId: stepId,
  });
}

function sendReasoningBriefChunk(
  stream: StreamChunkSender,
  brief: { goal: string; approach: string; modules: string[] }
): boolean {
  return stream.send({
    type: "reasoning-brief",
    goal: brief.goal,
    approach: brief.approach,
    modules: brief.modules,
  });
}

export interface PipelineCompletionRecord {
  runId: string;
  writtenFiles: string[];
  composeText?: string;
  pipelineRecapMeta?: unknown;
  finishedAt: string;
}

function persistPipelineCompletion(
  workspaceRoot: string,
  runId: string | undefined,
  data: Omit<PipelineCompletionRecord, "runId">
): void {
  if (!workspaceRoot?.trim() || !runId) return;
  try {
    const dir = path.join(workspaceRoot, ".cavalo", "pipeline", runId);
    fs.mkdirSync(dir, { recursive: true });
    const record: PipelineCompletionRecord = {
      runId,
      writtenFiles: data.writtenFiles,
      composeText: data.composeText?.slice(0, 8000),
      pipelineRecapMeta: data.pipelineRecapMeta,
      finishedAt: data.finishedAt,
    };
    fs.writeFileSync(path.join(dir, "completion.json"), JSON.stringify(record, null, 2));
  } catch {
    /* non-fatal */
  }
}

export function loadRecentPipelineCompletion(
  workspaceRoot: string,
  maxAgeMs = 30 * 60 * 1000
): PipelineCompletionRecord | null {
  if (!workspaceRoot?.trim()) return null;
  const pipelineDir = path.join(workspaceRoot, ".cavalo", "pipeline");
  if (!fs.existsSync(pipelineDir)) return null;

  let best: PipelineCompletionRecord | null = null;
  let bestTime = 0;
  const cutoff = Date.now() - maxAgeMs;

  for (const runId of fs.readdirSync(pipelineDir)) {
    const file = path.join(pipelineDir, runId, "completion.json");
    if (!fs.existsSync(file)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as PipelineCompletionRecord;
      const finishedAt = Date.parse(parsed.finishedAt);
      if (!Number.isFinite(finishedAt) || finishedAt < cutoff) continue;
      if (finishedAt > bestTime) {
        bestTime = finishedAt;
        best = { ...parsed, runId: parsed.runId || runId };
      }
    } catch {
      /* skip corrupt */
    }
  }
  return best;
}

function enrichRequestWithWorkspaceBootstrap(
  request: CavalChatStreamRequest,
  workspaceRoot: string
): CavalChatStreamRequest {
  if (!workspaceRoot?.trim()) return request;
  const bootstrap = buildWorkspaceBootstrap(workspaceRoot);
  if (!bootstrap.trim()) return request;
  const merged = mergeProjectContextWithBootstrap(request.context?.projectContext, bootstrap);
  return {
    ...request,
    context: {
      ...request.context,
      projectContext: merged,
    },
  };
}

const activeStreamsBySender = new Map<number, Set<string>>();

function trackActiveStream(senderId: number, streamId: string): void {
  let streams = activeStreamsBySender.get(senderId);
  if (!streams) {
    streams = new Set();
    activeStreamsBySender.set(senderId, streams);
  }
  streams.add(streamId);
}

function untrackActiveStream(senderId: number, streamId: string): void {
  activeStreamsBySender.get(senderId)?.delete(streamId);
}

export function abortAllStreamsForSender(senderId: number): void {
  const streams = activeStreamsBySender.get(senderId);
  if (!streams?.size) return;
  for (const streamId of [...streams]) {
    abortMultiAgentPipeline(streamId);
  }
  streams.clear();
}

async function streamToRenderer(
  sender: WebContents,
  senderId: number,
  streamId: string,
  request: CavalChatStreamRequest,
  getWorkspaceRoot: (senderId: number) => string
): Promise<void> {
  trackActiveStream(senderId, streamId);
  const stream = createStreamChunkSender(sender, senderId, streamId);
  try {
  const workspaceRoot = request.workspaceRoot ?? getWorkspaceRoot(senderId);
  request = enrichRequestWithWorkspaceBootstrap(request, workspaceRoot);

  if (workspaceRoot?.trim()) {
    void ensureMcpServersReady(workspaceRoot).catch(() => undefined);
  }

  const useMultiAgent =
    !request.skipMultiAgent &&
    shouldUseMultiAgentPipeline(request.mode, request.message, workspaceRoot);

  if (useMultiAgent) {
    if (!stream.isAlive()) return;
    sendStatusChunk(stream, "prepare", "done");
    sendStatusChunk(stream, "route", "active");
    sendMultiAgentStatusChunk(stream, "context", "active", "pipeline start");

    const result = await runCavalloMultiAgentPipeline(sender, streamId, request, {
      onMultiAgentStatus: (phase, status, detail, modelId, stepId) => {
        if (!stream.isAlive()) return;
        sendMultiAgentStatusChunk(stream, phase, status, detail, modelId, stepId);
      },
      onReasoningBrief: (brief) => {
        if (!stream.isAlive()) return;
        sendReasoningBriefChunk(stream, brief);
      },
      onMeta: (resolvedModel, reason) => {
        if (!stream.isAlive()) return;
        stream.send({ type: "meta", resolvedModel, reason });
      },
      onDelta: (delta) => {
        if (!stream.isAlive()) return;
        stream.send({ type: "delta", delta });
      },
      onReasoning: (reasoningDelta) => {
        if (!stream.isAlive()) return;
        stream.send({ type: "reasoning", reasoningDelta });
      },
      onStatus: (phase, status, detail) => {
        if (!stream.isAlive()) return;
        sendStatusChunk(stream, phase, status, detail);
      },
    });

    if (!stream.isAlive()) return;

    if (result.ok && result.paused) {
      return;
    }

    if (result.ok) {
      persistPipelineCompletion(workspaceRoot, result.runId, {
        writtenFiles: result.writtenFiles ?? [],
        composeText: result.composeText ?? result.text,
        pipelineRecapMeta: result.pipelineRecapMeta,
        finishedAt: new Date().toISOString(),
      });
      if (result.text?.includes('```')) {
        if (!stream.send({ type: "delta", delta: result.text })) return;
      }
      stream.send({
        type: "done",
        model: result.resolvedModel,
        provider: result.provider,
        reasoningBrief: result.reasoningBrief,
        pipelineRecapMeta: result.pipelineRecapMeta,
        composeText: result.composeText ?? result.text,
        writtenFiles: result.writtenFiles,
        completionGate: result.completionGate,
        deliveryBlocked: result.deliveryBlocked,
        needsReview: result.needsReview,
        verifyPending: result.verifyPending,
      });
      return;
    }

    stream.send({
      type: "error",
      error: result.error ?? "Multi-agent pipeline failed",
    });
    return;
  }

  const fusedRequest =
    request.jsonMode || (request.context?.fileContent?.length ?? 0) > 400
      ? request
      : enrichChatWithZeroLatency(request, workspaceRoot);

  const effectiveModel = await resolveEffectiveChatModel(fusedRequest.model, fusedRequest.mode);
  const useTools = chatPanelUsesTools(fusedRequest.mode, workspaceRoot, effectiveModel);
  if (useTools) {
    await ensureMcpServersReady(workspaceRoot).catch(() => undefined);
  }

  if (!stream.isAlive()) return;

  const toolRegistry = useTools
    ? getOrCreateToolRegistry(senderId, workspaceRoot)
    : undefined;

  const completionInput: CompleteModelTextInput = {
    ...toCompletionInput(fusedRequest),
    toolRegistry,
    useTools,
    workspaceRoot,
  };

  sendStatusChunk(stream, "prepare", "done");
  sendStatusChunk(stream, "route", "active");

  const result = await executeModelCompletion(completionInput, {
    onMeta: (resolvedModel, reason) => {
      if (!stream.isAlive()) return;
      stream.send({ type: "meta", resolvedModel, reason });
    },
    onDelta: (delta) => {
      if (!stream.isAlive()) return;
      stream.send({ type: "delta", delta });
    },
    onReasoning: (reasoningDelta) => {
      if (!stream.isAlive()) return;
      stream.send({ type: "reasoning", reasoningDelta });
    },
    onStatus: (phase, status, detail) => {
      if (!stream.isAlive()) return;
      sendStatusChunk(stream, phase, status, detail);
    },
    onToolCall: (toolName, status, detail, writtenPath) => {
      if (!stream.isAlive()) return;
      const isDirectCodingMode = fusedRequest.mode === "code" || fusedRequest.mode === "debug";
      if (!isDirectCodingMode) {
        const notice = formatToolCallNotice(toolName, status, detail);
        if (notice) {
          if (!stream.send({ type: "delta", delta: notice })) return;
        }
      } else if (status === "error" && detail) {
        stream.send({
          type: "delta",
          delta: `\n⚠ ${toolName}: ${detail.slice(0, 120)}\n`,
        });
      } else if (status === "done" && toolName === "write_file" && writtenPath) {
        sendStatusChunk(stream, "write", "active", writtenPath);
      }
      stream.send({
        type: "tool",
        toolName,
        toolStatus: status,
        toolDetail: detail,
        toolWrittenPath: writtenPath,
      });
    },
  });

  if (!stream.isAlive()) return;

  if (result.ok) {
    stream.send({
      type: "done",
      model: result.resolvedModel,
      provider: result.provider,
    });
    return;
  }

  stream.send({
    type: "error",
    error: result.error,
  });

  } finally {
    untrackActiveStream(senderId, streamId);
  }
}

async function streamResumeToRenderer(
  sender: WebContents,
  senderId: number,
  input: {
    runId: string;
    streamId: string;
    uiPreferences: string;
    workspaceRoot: string;
    model: string;
    strictReview?: boolean;
  }
): Promise<void> {
  const { streamId } = input;
  trackActiveStream(senderId, streamId);
  const stream = createStreamChunkSender(sender, senderId, streamId);
  try {
    if (!stream.isAlive()) return;
    sendStatusChunk(stream, "prepare", "done");
    sendMultiAgentStatusChunk(stream, "subagent", "active", "UI delivery resume");

    const result = await resumeCavalloMultiAgentPipeline(sender, streamId, input, {
      onMultiAgentStatus: (phase, status, detail, modelId, stepId) => {
        if (!stream.isAlive()) return;
        sendMultiAgentStatusChunk(stream, phase, status, detail, modelId, stepId);
      },
      onMeta: (resolvedModel, reason) => {
        if (!stream.isAlive()) return;
        stream.send({ type: "meta", resolvedModel, reason });
      },
      onDelta: (delta) => {
        if (!stream.isAlive()) return;
        stream.send({ type: "delta", delta });
      },
      onReasoning: (reasoningDelta) => {
        if (!stream.isAlive()) return;
        stream.send({ type: "reasoning", reasoningDelta });
      },
      onStatus: (phase, status, detail) => {
        if (!stream.isAlive()) return;
        sendStatusChunk(stream, phase, status, detail);
      },
    });

    if (!stream.isAlive()) return;

    if (result.ok) {
      persistPipelineCompletion(input.workspaceRoot, result.runId ?? input.runId, {
        writtenFiles: result.writtenFiles ?? [],
        composeText: result.composeText ?? result.text,
        pipelineRecapMeta: result.pipelineRecapMeta,
        finishedAt: new Date().toISOString(),
      });
      if (result.text?.includes("```")) {
        if (!stream.send({ type: "delta", delta: result.text })) return;
      }
      stream.send({
        type: "done",
        model: result.resolvedModel,
        provider: result.provider,
        reasoningBrief: result.reasoningBrief,
        pipelineRecapMeta: result.pipelineRecapMeta,
        composeText: result.composeText ?? result.text,
        writtenFiles: result.writtenFiles,
        completionGate: result.completionGate,
        deliveryBlocked: result.deliveryBlocked,
        needsReview: result.needsReview,
        verifyPending: result.verifyPending,
      });
      return;
    }

    stream.send({
      type: "error",
      error: result.error ?? "Pipeline resume failed",
    });
  } finally {
    untrackActiveStream(senderId, streamId);
  }
}



export function registerModelHandlers(getWorkspaceRoot: (senderId: number) => string = () => process.cwd()): void {

  ipcMain.handle("caval:workspace-bootstrap", async (_event, workspaceRoot: string) => {
    const bootstrap = buildWorkspaceBootstrap(workspaceRoot);
    return { ok: true, bootstrap };
  });

  ipcMain.handle("multiagent:reasoning-config", async (_event, workspaceRoot?: string) => {
    return { ok: true, config: loadReasoningConfig(workspaceRoot) };
  });

  ipcMain.handle(
    "caval:workspace-verify",
    async (
      _event,
      workspaceRoot: string,
      options?: { autoInstall?: boolean; writtenFiles?: string[] }
    ) => {
    try {
      const verify = options?.autoInstall
        ? await runWorkspaceVerifyWithAutoFix(workspaceRoot, options)
        : await runWorkspaceVerify(workspaceRoot, options);
      return { ok: true, verify };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  );

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

  ipcMain.handle("caval:models-health", async () => {
    try {
      const snapshot = await buildModelsHealthSnapshot();
      return { ...snapshot };
    } catch (error) {
      return {
        ok: false,
        summary: error instanceof Error ? error.message : String(error),
        providers: {},
        models: {},
      };
    }
  });



  ipcMain.handle("caval:pipeline-recent-completion", async (_event, workspaceRoot: string) => {
    const completion = loadRecentPipelineCompletion(workspaceRoot);
    return { ok: true, completion };
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

  ipcMain.handle("caval:workspace-session-reset", async (event) => {
    abortAllStreamsForSender(event.sender.id);
    return { ok: true };
  });

  ipcMain.handle(
    "caval:pipeline-resume",
    async (
      event,
      input: {
        runId: string;
        streamId: string;
        uiPreferences: string;
        workspaceRoot: string;
        model: string;
        strictReview?: boolean;
      }
    ) => {
      warmOpenRouterConnection();
      void streamResumeToRenderer(event.sender, event.sender.id, input);
      return { ok: true, started: true };
    }
  );



  ipcMain.handle("caval:ai-complete", async (event, input: CavalAiCompleteRequest) => {
    try {
      const workspaceRoot = input.workspaceRoot ?? getWorkspaceRoot(event.sender.id);
      const useTools = input.jsonMode ? false : agentCompleteUsesTools(input.model);
      if (useTools) {
        await ensureMcpServersReady(workspaceRoot).catch(() => undefined);
      }
      const toolRegistry = getOrCreateToolRegistry(event.sender.id, workspaceRoot);
      return await completeModelText({
        ...input,
        workspaceRoot,
        toolRegistry,
        useTools,
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


