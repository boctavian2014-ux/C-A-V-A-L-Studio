import fs from "node:fs";
import path from "node:path";

import { ipcMain, type WebContents } from "electron";

import { buildModelCatalog, invalidateCatalogCache } from "../../ai/models/model-catalog";
import { buildModelsHealthSnapshot } from "../../ai/models/model-health";
import { warmOpenRouterConnection } from "../../ai/models/openrouter-warm";

import { clearOpenRouterCache } from "../../ai/models/openrouter-catalog";

import { resolveModelSelection } from "../../ai/models/auto-router";
import { getModelProfile } from "../../ai/model-profiles";

import {

  completeModelText,

  executeModelCompletion,

  type CompleteModelTextInput,

} from "../../ai/pipeline/model-completion";

import type { RoutingIntent } from "../../ai/types";

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
import {
  assertCadJobOwnedBySender,
  beginCancelOperation,
  getStreamAbortSignal,
  markOperationTerminal,
  registerStreamOperation,
} from "./operation-registry";
import {
  abortAbortableStream,
  finishAbortableStream,
  parseAbortStreamId,
  startAbortableStream,
} from "./abort/stream-abort";
import { cancelCadJobRemote } from "./cad-handlers";
import { releaseCadWorkspaceLock } from "./cad-workspace-lock";
import { loadMultiAgentConfig, loadReasoningConfig, usesAgenticToolRuntime } from "../../ai/composer/multi-agent/config";
import {
  buildWorkspaceBootstrap,
  mergeProjectContextWithBootstrap,
} from "../../ai/context/workspace-bootstrap";
import { WORKSPACE_BOOTSTRAP_MARKER } from "../../ai/context/workspace-bootstrap-shared";
import { runWorkspaceVerify, runWorkspaceVerifyWithAutoFix } from "../../ai/tools/workspace-verify";
import { runProjectHealthSnapshot } from "../../ai/tools/project-health-runner";
import { parseProjectHealthAction } from "../../src/shared/project-health-check";
import { assertTrustedSender } from "./ipc-trust";
import { consumeAiRateLimit, allowAiAbort } from "./ai-rate-limit";
import { safeErrorMessageForUi } from "../../ai/providers/provider-errors";
import type { IdeContextPayload } from "../shared/ai-context-contract";
import { applyIdeContextToChatRequest, applyEnhancedContextToChatRequest } from "./ai/ide-context-collector";
import { emitTimelineEvent } from "./ai/timeline-emit";
import {
  discardIncompleteStreamTimeline,
  persistAssistantMessageAndFlush,
} from "./ai/timeline-persistence";
import { persistAcceptedWrittenFiles } from "./ai/written-files-persistence";
import {
  emitQuickFixAcceptTimeline,
  emitQuickFixProposeTimeline,
  proposeQuickFix,
} from "./ai/quick-fix-runner";
import { summarizeToolDetail } from "../shared/ai-timeline-contract";
import type {
  QuickFixAcceptRequest,
  QuickFixRequest,
  QuickFixResult,
} from "../shared/ai-quick-fix-contract";
import type { TimelineFileWriteRequest } from "../shared/ai-inline-completion-contract";
import type {
  ExplainRequest,
  ExplainResult,
} from "../shared/ai-explain-contract";
import {
  emitExplainTimeline,
  runExplain,
} from "./ai/explain-runner";
import type {
  RefactorRequest,
  RefactorResult,
} from "../shared/ai-refactor-contract";
import {
  emitRefactorProposeTimeline,
  runRefactorPropose,
} from "./ai/refactor-runner";



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

  /**
   * Optional IDE snapshot from the renderer (Pas 5.2).
   * Main re-validates and budgets; absent when the per-thread toggle is OFF.
   * Must not carry workspaceRoot as authority.
   */
  ideContext?: IdeContextPayload;

  /** Pas 6.1 — propose localized diagnostic fix (no disk write). */
  quickFix?: QuickFixRequest;

  /** Pas 6.1 — after renderer accept: emit file_write on timeline only. */
  quickFixAccept?: QuickFixAcceptRequest;

  /** Pas 6.2 — after inline completion Tab accept: emit file_write on timeline only. */
  timelineFileWrite?: TimelineFileWriteRequest;

  /** Pas 6.3 — read-only explain on hover / selection. */
  explain?: ExplainRequest;

  /** Pas 6.5 — gated multi-file refactor propose (no disk write). */
  refactor?: RefactorRequest;

  /** Pas 7a.2 — UI thread id used as conversation_id at assistant completion. */
  conversationId?: string;

  /** Pas 7e.2 — UI assistant bubble id; reused as messages.id for feedback alignment. */
  assistantMessageId?: string;

}



export interface CavalAiCompleteRequest {

  model: string;

  intent?: RoutingIntent;

  capability?: CompleteModelTextInput["capability"];

  messages: ChatStreamMessage[];

  workspaceRoot?: string;

  requestId?: string;

  apiKeys?: never;

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

  if (mode === "code") return "code";

  if (mode === "agentic") return "chat";

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

function agenticToolLoopAddon(): string {
  return [
    "",
    "TOOL LOOP MODE:",
    "- Use tools first: list_dir, search_codebase, read_file, then write_file with REAL relative paths.",
    "- Prefer targeted reads before edits; avoid rewriting unrelated files.",
    "- After edits, verify with run_command or run_terminal using allowlisted commands such as npm install, npm run build, npm test, npm run typecheck.",
    "- Iterate on tool outputs until the task is complete or a concrete blocker remains.",
    "- Do NOT emit ```lang:path``` fenced files unless the user explicitly asks for raw code in chat.",
    "- Never invent placeholder paths like src/index_17.tsx or unnamed generated files.",
    "- Keep chat output short; the work should happen through tools and real files.",
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
  const multiAgentConfig = request.workspaceRoot?.trim()
    ? loadMultiAgentConfig(request.workspaceRoot)
    : undefined;
  const usesToolLoopAgentic =
    request.mode === "agentic" && usesAgenticToolRuntime(multiAgentConfig);
  if (usesToolLoopAgentic) {
    system += agenticToolLoopAddon();
  } else if (request.mode === "agentic" && request.workspaceRoot) {
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



export function chatPanelUsesTools(mode?: string, workspaceRoot?: string, model?: string): boolean {
  if (!workspaceRoot?.trim()) return false;
  if (mode !== "code" && mode !== "debug" && mode !== "agentic") return false;
  if (!model || model === "ollama-local") return false;
  if (model.startsWith("caval-auto/free")) return false;
  const profile = getModelProfile(model);
  if (profile?.provider === "open_source" || profile?.costEstimate === "local") return false;
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

function sendToolTimeline(
  stream: StreamChunkSender,
  streamId: string,
  toolName: string,
  status: "start" | "done" | "error",
  detail?: string,
  writtenPath?: string
): void {
  const shortName = toolName.replace(/^mcp:[^:]+:/, "");
  if (status === "start") {
    emitTimelineEvent(stream, streamId, {
      type: "tool_call",
      label: `Running ${shortName}`,
      toolName: shortName,
    });
    return;
  }

  const success = status === "done";
  emitTimelineEvent(stream, streamId, {
    type: "tool_result",
    label: success ? `${shortName} succeeded` : `${shortName} failed`,
    toolName: shortName,
    success,
    detail: summarizeToolDetail(detail, success),
  });

  if (success && writtenPath?.trim()) {
    emitTimelineEvent(stream, streamId, {
      type: "file_write",
      label: `Updated ${writtenPath.trim().replace(/\\/g, "/")}`,
      filePath: writtenPath.trim().replace(/\\/g, "/"),
      success: true,
    });
  }

  if (!success) {
    emitTimelineEvent(stream, streamId, {
      type: "error",
      label: `${shortName} error`,
      toolName: shortName,
      success: false,
      detail: summarizeToolDetail(detail, false),
    });
  }
}

function sendMultiAgentStatusChunk(
  stream: StreamChunkSender,
  streamId: string,
  phase: import("../../ai/composer/chat-activity-types").MultiAgentPhase,
  status: "active" | "done",
  detail?: string,
  modelId?: string,
  stepId?: string,
  auditBadge?: string,
  parallelGroup?: string
): boolean {
  if (status === "active") {
    const label =
      detail?.trim() ||
      phase;
    emitTimelineEvent(stream, streamId, {
      type: "reasoning",
      label: `Pipeline · ${label}`.slice(0, 160),
      detail: modelId ? `model ${modelId}` : undefined,
    });
  }
  return stream.send({
    type: "multiagent",
    multiAgentPhase: phase,
    status,
    detail,
    multiAgentModel: modelId,
    multiAgentStepId: stepId,
    multiAgentAuditBadge: auditBadge,
    multiAgentParallelGroup: parallelGroup,
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
/** streamId → { senderId, workspaceRoot } for abort/resume scoping (Lot C5.2). */
const streamOwners = new Map<string, { senderId: number; workspaceRoot: string }>();

function trackActiveStream(senderId: number, streamId: string, workspaceRoot = ""): void {
  let streams = activeStreamsBySender.get(senderId);
  if (!streams) {
    streams = new Set();
    activeStreamsBySender.set(senderId, streams);
  }
  streams.add(streamId);
  streamOwners.set(streamId, { senderId, workspaceRoot: workspaceRoot.trim() });
}

function untrackActiveStream(senderId: number, streamId: string): void {
  activeStreamsBySender.get(senderId)?.delete(streamId);
  streamOwners.delete(streamId);
}

function assertStreamOwnedBySender(
  senderId: number,
  streamId: string,
  workspaceRoot?: string
): { ok: true } | { ok: false; error: string } {
  const owner = streamOwners.get(streamId);
  if (!owner) {
    // Allow abort of unknown/expired ids only from same sender tracking set.
    const tracked = activeStreamsBySender.get(senderId)?.has(streamId);
    if (tracked) return { ok: true };
    return { ok: false, error: "Stream not found for this sender" };
  }
  if (owner.senderId !== senderId) {
    return { ok: false, error: "Cross-sender stream control denied" };
  }
  if (
    workspaceRoot?.trim() &&
    owner.workspaceRoot &&
    owner.workspaceRoot !== workspaceRoot.trim()
  ) {
    return { ok: false, error: "Cross-workspace stream control denied" };
  }
  return { ok: true };
}

export function abortAllStreamsForSender(senderId: number): void {
  const streams = activeStreamsBySender.get(senderId);
  if (!streams?.size) return;
  for (const streamId of [...streams]) {
    discardIncompleteStreamTimeline(streamId);
    abortAbortableStream(streamId, "sender gone");
    abortMultiAgentPipeline(streamId);
  }
  streams.clear();
}

async function streamRefactorToRenderer(
  stream: StreamChunkSender,
  streamId: string,
  request: CavalChatStreamRequest,
  signal: AbortSignal
): Promise<void> {
  const workspaceRoot = request.workspaceRoot?.trim() ?? "";
  const refactor = request.refactor;
  if (!refactor) return;

  if (!workspaceRoot) {
    markOperationTerminal(streamId, "failed");
    const result: RefactorResult = { success: false, error: "No bound workspace" };
    emitRefactorProposeTimeline(stream, streamId, refactor, result);
    stream.send({
      type: "error",
      error: "Deschide un folder în workspace înainte de Refactor.",
      refactor: result,
    });
    return;
  }

  sendStatusChunk(stream, "prepare", "done");
  sendStatusChunk(stream, "think", "active", "refactor");

  const result = await runRefactorPropose({
    workspaceRoot,
    request: { ...refactor, streamId },
    signal,
    complete: async ({ messages, signal: completeSignal, maxTokens, jsonMode }) => {
      const completed = await completeModelText({
        model: (request.model || "auto-balanced") as CompleteModelTextInput["model"],
        intent: "multi_file",
        capability: "code",
        messages,
        workspaceRoot,
        requestId: streamId,
        signal: completeSignal ?? signal,
        maxTokens,
        jsonMode,
        temperature: 0.1,
      });
      if (!completed.ok) return { ok: false, error: completed.error };
      return { ok: true, text: completed.text };
    },
  });

  if (!stream.isAlive() || signal.aborted) {
    markOperationTerminal(streamId, "aborted");
    stream.send({ type: "error", error: "Generare anulată." });
    return;
  }

  emitRefactorProposeTimeline(stream, streamId, refactor, result);
  sendStatusChunk(stream, "think", "done");

  if (!result.success) {
    markOperationTerminal(streamId, "failed");
    stream.send({
      type: "error",
      error: safeErrorMessageForUi(result.error ?? "Refactor failed"),
      refactor: result,
    });
    return;
  }

  markOperationTerminal(streamId, "completed");
  stream.send({
    type: "done",
    refactor: result,
  });
}

async function streamExplainToRenderer(
  stream: StreamChunkSender,
  streamId: string,
  request: CavalChatStreamRequest,
  signal: AbortSignal
): Promise<void> {
  const workspaceRoot = request.workspaceRoot?.trim() ?? "";
  const explain = request.explain;
  if (!explain) return;

  if (!workspaceRoot) {
    markOperationTerminal(streamId, "failed");
    const result: ExplainResult = { success: false, error: "No bound workspace" };
    emitExplainTimeline(stream, streamId, explain.filePath, result, explain.symbol ?? "selection");
    stream.send({
      type: "error",
      error: "Deschide un folder în workspace înainte de Explain.",
      explain: result,
    });
    return;
  }

  sendStatusChunk(stream, "prepare", "done");
  sendStatusChunk(stream, "think", "active", "explain");

  const result = await runExplain({
    workspaceRoot,
    request: { ...explain, streamId },
    signal,
    complete: async ({ messages, signal: completeSignal, maxTokens }) => {
      const completed = await completeModelText({
        model: (request.model || "auto-balanced") as CompleteModelTextInput["model"],
        intent: "analysis",
        capability: "chat",
        messages,
        workspaceRoot,
        requestId: streamId,
        signal: completeSignal ?? signal,
        maxTokens,
        temperature: 0.2,
      });
      if (!completed.ok) return { ok: false, error: completed.error };
      return { ok: true, text: completed.text };
    },
  });

  if (!stream.isAlive() || signal.aborted) {
    markOperationTerminal(streamId, "aborted");
    stream.send({ type: "error", error: "Generare anulată." });
    return;
  }

  const focus = explain.symbol ?? "selection";
  emitExplainTimeline(stream, streamId, explain.filePath, result, focus);
  sendStatusChunk(stream, "think", "done");

  if (!result.success) {
    markOperationTerminal(streamId, "failed");
    stream.send({
      type: "error",
      error: safeErrorMessageForUi(result.error ?? "Explain failed"),
      explain: result,
    });
    return;
  }

  markOperationTerminal(streamId, "completed");
  stream.send({
    type: "done",
    explain: result,
  });
}

async function streamQuickFixToRenderer(
  stream: StreamChunkSender,
  streamId: string,
  request: CavalChatStreamRequest,
  signal: AbortSignal
): Promise<void> {
  const workspaceRoot = request.workspaceRoot?.trim() ?? "";

  if (request.quickFixAccept || request.timelineFileWrite) {
    const acceptPayload: QuickFixAcceptRequest & { detail?: string } = request.quickFixAccept
      ? { ...request.quickFixAccept }
      : {
          filePath: request.timelineFileWrite!.filePath,
          editCount: 1,
          detail: request.timelineFileWrite!.detail,
        };
    if (!workspaceRoot) {
      markOperationTerminal(streamId, "failed");
      emitTimelineEvent(stream, streamId, {
        type: "error",
        label: "Editor accept failed",
        success: false,
        detail: "No bound workspace",
      });
      stream.send({
        type: "error",
        error: "Deschide un folder în workspace înainte de această acțiune AI.",
        quickFix: { success: false, error: "No bound workspace" } satisfies QuickFixResult,
      });
      return;
    }
    const acceptResult = emitQuickFixAcceptTimeline(stream, streamId, acceptPayload);
    if (!acceptResult.success) {
      markOperationTerminal(streamId, "failed");
      stream.send({
        type: "error",
        error: acceptResult.error ?? "Accept failed",
        quickFix: acceptResult,
      });
      return;
    }
    const writtenRel = acceptPayload.filePath.replace(/\\/g, "/");
    // Pas 7a.3 — snapshot post-Accept (editor already wrote disk / buffer).
    persistAcceptedWrittenFiles({
      workspaceRoot,
      filePaths: [writtenRel],
      conversationId: request.conversationId,
      streamId,
    });
    markOperationTerminal(streamId, "completed");
    stream.send({
      type: "done",
      quickFix: acceptResult,
      writtenFiles: [writtenRel],
    });
    return;
  }

  const quickFix = request.quickFix;
  if (!quickFix) return;

  if (!workspaceRoot) {
    markOperationTerminal(streamId, "failed");
    const result: QuickFixResult = { success: false, error: "No bound workspace" };
    emitQuickFixProposeTimeline(stream, streamId, quickFix.filePath, quickFix.diagnostic.startLine, result);
    stream.send({
      type: "error",
      error: "Deschide un folder în workspace înainte de quick fix.",
      quickFix: result,
    });
    return;
  }

  sendStatusChunk(stream, "prepare", "done");
  sendStatusChunk(stream, "think", "active", "quick fix");

  const result = await proposeQuickFix({
    workspaceRoot,
    request: { ...quickFix, streamId },
    signal,
    complete: async ({ messages, signal: completeSignal, maxTokens, jsonMode }) => {
      const completed = await completeModelText({
        model: (request.model || "auto-balanced") as CompleteModelTextInput["model"],
        intent: "debug",
        capability: "code",
        messages,
        workspaceRoot,
        requestId: streamId,
        signal: completeSignal ?? signal,
        maxTokens,
        jsonMode,
        temperature: 0.1,
      });
      if (!completed.ok) return { ok: false, error: completed.error };
      return { ok: true, text: completed.text };
    },
  });

  if (!stream.isAlive() || signal.aborted) {
    markOperationTerminal(streamId, "aborted");
    stream.send({ type: "error", error: "Generare anulată." });
    return;
  }

  emitQuickFixProposeTimeline(
    stream,
    streamId,
    quickFix.filePath,
    quickFix.diagnostic.startLine,
    result
  );
  sendStatusChunk(stream, "think", "done");

  if (!result.success) {
    markOperationTerminal(streamId, "failed");
    stream.send({
      type: "error",
      error: safeErrorMessageForUi(result.error ?? "Quick fix failed"),
      quickFix: result,
    });
    return;
  }

  markOperationTerminal(streamId, "completed");
  stream.send({
    type: "done",
    quickFix: result,
  });
}

async function streamToRenderer(
  sender: WebContents,
  senderId: number,
  streamId: string,
  request: CavalChatStreamRequest,
  getWorkspaceRoot: (senderId: number) => string,
  getBoundWorkspaceRoot?: (senderId: number) => string | undefined
): Promise<void> {
  trackActiveStream(senderId, streamId);
  const stream = createStreamChunkSender(sender, senderId, streamId);
  try {
  const explicitRoot = request.workspaceRoot?.trim();
  const boundRoot = getBoundWorkspaceRoot?.(senderId)?.trim();
  const userBoundWorkspace = Boolean(explicitRoot || boundRoot);
  const workspaceRoot = explicitRoot || boundRoot || getWorkspaceRoot(senderId);
  const multiAgentConfig = workspaceRoot?.trim()
    ? loadMultiAgentConfig(workspaceRoot)
    : undefined;
  streamOwners.set(streamId, { senderId, workspaceRoot: workspaceRoot?.trim() ?? "" });
  registerStreamOperation({
    streamId,
    senderId,
    workspaceRoot: workspaceRoot?.trim() ?? "",
  });
  const abortRoot = startAbortableStream(streamId);
  // Bound workspace is authoritative — never trust renderer cwd for context.
  request = { ...request, workspaceRoot };
  if (request.ideContext !== undefined) {
    request = applyIdeContextToChatRequest(request, request.ideContext);
  }
  // Pas 7d.3 — related workspace files from lexical index search (skip editor micro-ops).
  if (
    !request.quickFix &&
    !request.quickFixAccept &&
    !request.timelineFileWrite &&
    !request.explain &&
    !request.refactor
  ) {
    request = await applyEnhancedContextToChatRequest(request, workspaceRoot);
  }
  request = enrichRequestWithWorkspaceBootstrap(request, workspaceRoot);

  // Pas 6.1 / 6.2 — editor write accepts + quick-fix propose on existing stream channel.
  if (request.quickFixAccept || request.quickFix || request.timelineFileWrite) {
    if (!userBoundWorkspace) {
      markOperationTerminal(streamId, "failed");
      const result = {
        success: false,
        error: "No bound workspace",
      } as const;
      if (request.quickFix) {
        emitQuickFixProposeTimeline(
          stream,
          streamId,
          request.quickFix.filePath,
          request.quickFix.diagnostic.startLine,
          result
        );
      } else {
        emitTimelineEvent(stream, streamId, {
          type: "error",
          label: "Editor timeline emit failed",
          success: false,
          detail: "No bound workspace",
        });
      }
      stream.send({
        type: "error",
        error: "Deschide un folder în workspace înainte de această acțiune AI.",
        quickFix: result,
      });
      return;
    }
    await streamQuickFixToRenderer(stream, streamId, request, abortRoot.signal);
    return;
  }

  // Pas 6.3 — read-only explain (no file_write).
  if (request.explain) {
    if (!userBoundWorkspace) {
      markOperationTerminal(streamId, "failed");
      const result: ExplainResult = { success: false, error: "No bound workspace" };
      emitExplainTimeline(
        stream,
        streamId,
        request.explain.filePath,
        result,
        request.explain.symbol ?? "selection"
      );
      stream.send({
        type: "error",
        error: "Deschide un folder în workspace înainte de Explain.",
        explain: result,
      });
      return;
    }
    await streamExplainToRenderer(stream, streamId, request, abortRoot.signal);
    return;
  }

  // Pas 6.5 — gated multi-file refactor (no disk write until Accept).
  if (request.refactor) {
    if (!userBoundWorkspace) {
      markOperationTerminal(streamId, "failed");
      const result: RefactorResult = { success: false, error: "No bound workspace" };
      emitRefactorProposeTimeline(stream, streamId, request.refactor, result);
      stream.send({
        type: "error",
        error: "Deschide un folder în workspace înainte de Refactor.",
        refactor: result,
      });
      return;
    }
    await streamRefactorToRenderer(stream, streamId, request, abortRoot.signal);
    return;
  }

  if (workspaceRoot?.trim()) {
    void ensureMcpServersReady(workspaceRoot).catch(() => undefined);
  }

  if (!request.skipMultiAgent && request.mode === "agentic" && !userBoundWorkspace) {
    if (!stream.isAlive()) return;
    stream.send({
      type: "error",
      error: "Deschide un folder în workspace înainte de modul Agentic.",
    });
    return;
  }

  const useMultiAgent =
    !request.skipMultiAgent &&
    shouldUseMultiAgentPipeline(request.mode, request.message, workspaceRoot, multiAgentConfig, {
      userBoundWorkspace,
    });

  if (useMultiAgent) {
    if (!stream.isAlive()) return;
    sendStatusChunk(stream, "prepare", "done");
    sendStatusChunk(stream, "route", "active");
    sendMultiAgentStatusChunk(stream, streamId, "context", "active", "pipeline start");

    const result = await runCavalloMultiAgentPipeline(
      sender,
      streamId,
      request,
      {
      onMultiAgentStatus: (phase, status, detail, modelId, stepId, auditBadge, parallelGroup) => {
        if (!stream.isAlive()) return;
        sendMultiAgentStatusChunk(stream, streamId, phase, status, detail, modelId, stepId, auditBadge, parallelGroup);
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
    },
      abortRoot.id
    );

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
      const proposedWrites = result.proposedWrites ?? [];
      if (proposedWrites.length > 0) {
        emitTimelineEvent(stream, streamId, {
          type: "tool_call",
          label: `propose ${proposedWrites.length} file(s)`,
          toolName: "chat_apply",
        });
        emitTimelineEvent(stream, streamId, {
          type: "tool_result",
          label: `${proposedWrites.length} change(s) awaiting Accept`,
          toolName: "chat_apply",
          success: true,
        });
      }
      // Pas 6.4 — no file_write until Accept; paths listed as proposed only.
      persistAssistantMessageAndFlush({
        workspaceRoot,
        conversationId: request.conversationId,
        messageId: request.assistantMessageId,
        streamId,
        content: result.composeText ?? result.text ?? "",
      });
      stream.send({
        type: "done",
        model: result.resolvedModel,
        provider: result.provider,
        reasoningBrief: result.reasoningBrief,
        pipelineRecapMeta: result.pipelineRecapMeta,
        composeText: result.composeText ?? result.text,
        writtenFiles: [],
        proposedWrites,
        proposeStageKey: result.runId,
        completionGate: result.completionGate,
        deliveryBlocked: result.deliveryBlocked,
        needsReview: result.needsReview,
        verifyPending: result.verifyPending,
      });
      return;
    }

    emitTimelineEvent(stream, streamId, {
      type: "error",
      label: "Pipeline failed",
      success: false,
      detail: summarizeToolDetail(result.error, false),
    });
    stream.send({
      type: "error",
      error: safeErrorMessageForUi(result.error ?? "Multi-agent pipeline failed"),
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
    signal: getStreamAbortSignal(streamId) ?? abortRoot.signal,
    abortParentId: abortRoot.id,
  };

  sendStatusChunk(stream, "prepare", "done");
  sendStatusChunk(stream, "route", "active");

  let emittedReasoningTimeline = false;

  const result = await executeModelCompletion(completionInput, {
    onMeta: (resolvedModel, reason) => {
      if (!stream.isAlive() || getStreamAbortSignal(streamId)?.aborted) return;
      stream.send({ type: "meta", resolvedModel, reason });
    },
    onDelta: (delta) => {
      if (!stream.isAlive() || getStreamAbortSignal(streamId)?.aborted) return;
      stream.send({ type: "delta", delta });
    },
    onReasoning: (reasoningDelta) => {
      if (!stream.isAlive() || getStreamAbortSignal(streamId)?.aborted) return;
      if (!emittedReasoningTimeline && reasoningDelta.trim()) {
        emittedReasoningTimeline = true;
        emitTimelineEvent(stream, streamId, {
          type: "reasoning",
          label: "Analyzing…",
        });
      }
      stream.send({ type: "reasoning", reasoningDelta });
    },
    onStatus: (phase, status, detail) => {
      if (!stream.isAlive() || getStreamAbortSignal(streamId)?.aborted) return;
      if (phase === "think" && status === "active" && !emittedReasoningTimeline) {
        emittedReasoningTimeline = true;
        emitTimelineEvent(stream, streamId, {
          type: "reasoning",
          label: detail?.trim() ? detail : "Thinking…",
        });
      }
      sendStatusChunk(stream, phase, status, detail);
    },
    onToolCall: (toolName, status, detail, writtenPath) => {
      if (!stream.isAlive() || getStreamAbortSignal(streamId)?.aborted) return;
      const isDirectCodingMode =
        fusedRequest.mode === "code" || fusedRequest.mode === "debug" || fusedRequest.mode === "agentic";
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
      sendToolTimeline(stream, streamId, toolName, status, detail, writtenPath);
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

  if (getStreamAbortSignal(streamId)?.aborted) {
    markOperationTerminal(streamId, "aborted");
    emitTimelineEvent(stream, streamId, {
      type: "error",
      label: "Generation cancelled",
      success: false,
    });
    stream.send({
      type: "error",
      error: "Generare anulată.",
    });
    return;
  }

  if (result.ok) {
    markOperationTerminal(streamId, "completed");
    persistAssistantMessageAndFlush({
      workspaceRoot,
      conversationId: request.conversationId,
      messageId: request.assistantMessageId,
      streamId,
      content: result.text ?? "",
    });
    stream.send({
      type: "done",
      model: result.resolvedModel,
      provider: result.provider,
    });
    return;
  }

  markOperationTerminal(streamId, result.error?.includes("anulat") ? "aborted" : "failed");
  emitTimelineEvent(stream, streamId, {
      type: "error",
      label: "Stream failed",
      success: false,
      detail: summarizeToolDetail(result.error, false),
    });
    stream.send({
      type: "error",
      error: safeErrorMessageForUi(result.error ?? "Stream failed"),
    });

  } finally {
    discardIncompleteStreamTimeline(streamId);
    finishAbortableStream(streamId);
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
    registerStreamOperation({
      streamId,
      senderId,
      workspaceRoot: input.workspaceRoot?.trim() ?? "",
    });
    const abortRoot = startAbortableStream(streamId);
    if (!stream.isAlive()) return;
    sendStatusChunk(stream, "prepare", "done");
    sendMultiAgentStatusChunk(stream, streamId, "subagent", "active", "UI delivery resume");

    const result = await resumeCavalloMultiAgentPipeline(sender, streamId, input, {
      onMultiAgentStatus: (phase, status, detail, modelId, stepId, auditBadge, parallelGroup) => {
        if (!stream.isAlive()) return;
        sendMultiAgentStatusChunk(stream, streamId, phase, status, detail, modelId, stepId, auditBadge, parallelGroup);
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
    }, abortRoot.id);

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
      const proposedWrites = result.proposedWrites ?? [];
      if (proposedWrites.length > 0) {
        emitTimelineEvent(stream, streamId, {
          type: "tool_call",
          label: `propose ${proposedWrites.length} file(s)`,
          toolName: "chat_apply",
        });
        emitTimelineEvent(stream, streamId, {
          type: "tool_result",
          label: `${proposedWrites.length} change(s) awaiting Accept`,
          toolName: "chat_apply",
          success: true,
        });
      }
      persistAssistantMessageAndFlush({
        workspaceRoot: input.workspaceRoot,
        conversationId: undefined,
        streamId,
        content: result.composeText ?? result.text ?? "",
      });
      stream.send({
        type: "done",
        model: result.resolvedModel,
        provider: result.provider,
        reasoningBrief: result.reasoningBrief,
        pipelineRecapMeta: result.pipelineRecapMeta,
        composeText: result.composeText ?? result.text,
        writtenFiles: [],
        proposedWrites,
        proposeStageKey: result.runId ?? input.runId,
        completionGate: result.completionGate,
        deliveryBlocked: result.deliveryBlocked,
        needsReview: result.needsReview,
        verifyPending: result.verifyPending,
      });
      return;
    }

    emitTimelineEvent(stream, streamId, {
      type: "error",
      label: "Pipeline resume failed",
      success: false,
      detail: summarizeToolDetail(result.error, false),
    });
    stream.send({
      type: "error",
      error: safeErrorMessageForUi(result.error ?? "Pipeline resume failed"),
    });
  } finally {
    discardIncompleteStreamTimeline(streamId);
    finishAbortableStream(streamId);
    untrackActiveStream(senderId, streamId);
  }
}



export function registerModelHandlers(
  getWorkspaceRoot: (senderId: number) => string = () => process.cwd(),
  getBoundWorkspaceRoot?: (senderId: number) => string | undefined
): void {

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
      event,
      _workspaceRootFromRenderer: unknown,
      options?: { autoInstall?: boolean; writtenFiles?: string[] }
    ) => {
    try {
      assertTrustedSender(event);
      // Lot B: ignore renderer workspaceRoot — bound root only
      const workspaceRoot = getBoundWorkspaceRoot?.(event.sender.id)?.trim();
      if (!workspaceRoot) {
        return {
          ok: false,
          error: "Deschide un folder în workspace înainte de Workspace Verify.",
        };
      }
      const safeOptions = {
        autoInstall: options?.autoInstall === true,
        writtenFiles: Array.isArray(options?.writtenFiles)
          ? options.writtenFiles.filter((f): f is string => typeof f === "string")
          : undefined,
      };
      const verify = safeOptions.autoInstall
        ? await runWorkspaceVerifyWithAutoFix(workspaceRoot, safeOptions)
        : await runWorkspaceVerify(workspaceRoot, safeOptions);
      return { ok: true, verify };
    } catch (error) {
      return {
        ok: false,
        error: safeErrorMessageForUi(error),
      };
    }
  }
  );

  ipcMain.handle("caval:project-health-check", async (event, actionInput: unknown) => {
    try {
      assertTrustedSender(event);
      const action = parseProjectHealthAction(actionInput);
      if (!action) {
        return { ok: false, error: "Invalid project health action" };
      }

      const workspaceRoot = getBoundWorkspaceRoot?.(event.sender.id)?.trim();
      if (!workspaceRoot) {
        return {
          ok: false,
          error: "Deschide un folder în workspace înainte de Project Health Check.",
        };
      }

      const snapshot = await runProjectHealthSnapshot(workspaceRoot, {
        execute: action === "execute",
      });
      return { ok: true, snapshot };
    } catch (error) {
      return {
        ok: false,
        error: safeErrorMessageForUi(error),
      };
    }
  });

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
        summary: safeErrorMessageForUi(error),
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
    assertTrustedSender(event);
    const boundRoot =
      getBoundWorkspaceRoot?.(event.sender.id)?.trim() ||
      request.workspaceRoot?.trim() ||
      getWorkspaceRoot(event.sender.id);
    const limit = consumeAiRateLimit("stream_start", event.sender.id, boundRoot);
    if (!limit.ok) {
      return {
        ok: false,
        error: "rate_limited",
        code: "rate_limited_local",
        retryAfterMs: limit.retryAfterMs,
      };
    }
    warmOpenRouterConnection();
    void streamToRenderer(event.sender, event.sender.id, request.streamId, request, getWorkspaceRoot, getBoundWorkspaceRoot);
    return { ok: true, started: true };
  });

  ipcMain.handle("caval:ai-stream-abort", async (event, streamId: unknown) => {
    assertTrustedSender(event);
    allowAiAbort();
    const parsed = parseAbortStreamId(streamId);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }
    const owned = assertStreamOwnedBySender(event.sender.id, parsed.streamId);
    if (!owned.ok) {
      return { ok: false, error: owned.error };
    }
    discardIncompleteStreamTimeline(parsed.streamId);
    const cascaded = abortAbortableStream(parsed.streamId, "user cancelled");
    const cancel = beginCancelOperation({
      streamId: parsed.streamId,
      senderId: event.sender.id,
    });
    abortMultiAgentPipeline(parsed.streamId);
    untrackActiveStream(event.sender.id, parsed.streamId);
    return {
      ok: cancel.ok,
      status: cancel.status,
      signalAborted: cascaded || Boolean(cancel.signalAborted),
      error: cancel.error,
    };
  });

  ipcMain.handle(
    "caval:cancel-operation",
    async (
      event,
      input: {
        operationId?: string;
        streamId?: string;
        cadJobId?: string;
        workspaceRoot?: string;
        cavalId?: string;
      }
    ) => {
      assertTrustedSender(event);
      allowAiAbort();
      const streamId = input?.streamId ? String(input.streamId) : undefined;
      const cadJobId = input?.cadJobId ? String(input.cadJobId) : undefined;

      if (streamId) {
        const owned = assertStreamOwnedBySender(
          event.sender.id,
          streamId,
          input?.workspaceRoot
        );
        if (!owned.ok && !cadJobId) {
          return { ok: false, error: owned.error, status: "unknown" as const };
        }
      }
      if (cadJobId) {
        const ownedCad = assertCadJobOwnedBySender(
          event.sender.id,
          cadJobId,
          input?.workspaceRoot
        );
        if (!ownedCad.ok) {
          return { ok: false, error: ownedCad.error, status: "unknown" as const };
        }
      }

      const cancel = beginCancelOperation({
        operationId: input?.operationId,
        streamId,
        cadJobId,
        senderId: event.sender.id,
        workspaceRoot: input?.workspaceRoot,
      });
      if (!cancel.ok) {
        return cancel;
      }

      if (streamId) {
        abortAbortableStream(streamId, "user cancelled");
        abortMultiAgentPipeline(streamId);
        untrackActiveStream(event.sender.id, streamId);
      }

      let remoteCancel = cancel.remoteCancel ?? ("skipped" as const);
      const jobToCancel = cancel.cadJobId ?? cadJobId;
      if (jobToCancel) {
        const remote = await cancelCadJobRemote(jobToCancel, input?.cavalId);
        remoteCancel = remote.remoteCancel;
        if (!remote.ok && remote.remoteCancel === "failed") {
          return {
            ok: true,
            status: "aborted" as const,
            operationId: cancel.operationId,
            streamId: cancel.streamId,
            cadJobId: jobToCancel,
            signalAborted: cancel.signalAborted,
            remoteCancel: "failed" as const,
            error: remote.error,
          };
        }
        if (remote.remoteCancel === "ok" || remote.remoteCancel === "skipped") {
          releaseCadWorkspaceLock({
            jobId: jobToCancel,
            workspaceRoot: input?.workspaceRoot,
            reason: "aborted",
          });
        }
      }

      return {
        ok: true,
        status: cancel.status,
        operationId: cancel.operationId,
        streamId: cancel.streamId,
        cadJobId: jobToCancel,
        signalAborted: cancel.signalAborted,
        remoteCancel,
      };
    }
  );

  ipcMain.handle("caval:workspace-session-reset", async (event) => {
    assertTrustedSender(event);
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
      assertTrustedSender(event);
      const boundRoot =
        getBoundWorkspaceRoot?.(event.sender.id)?.trim() || input.workspaceRoot?.trim() || "";
      const limit = consumeAiRateLimit("resume", event.sender.id, boundRoot);
      if (!limit.ok) {
        return {
          ok: false,
          error: "rate_limited",
          code: "rate_limited_local",
          retryAfterMs: limit.retryAfterMs,
        };
      }
      const owned = assertStreamOwnedBySender(event.sender.id, input.streamId, boundRoot);
      // Resume may create a new stream id after prior completion — allow if not claimed by another sender.
      if (!owned.ok && owned.error.includes("Cross-sender")) {
        return { ok: false, error: owned.error };
      }
      trackActiveStream(event.sender.id, input.streamId, boundRoot);
      warmOpenRouterConnection();
      void streamResumeToRenderer(event.sender, event.sender.id, input);
      return { ok: true, started: true };
    }
  );



  ipcMain.handle("caval:ai-complete", async (event, input: CavalAiCompleteRequest) => {
    try {
      assertTrustedSender(event);
      const { apiKeys: _ignoredApiKeys, ...safeInput } = input as CavalAiCompleteRequest & {
        apiKeys?: unknown;
      };
      void _ignoredApiKeys;
      const workspaceRoot = safeInput.workspaceRoot ?? getWorkspaceRoot(event.sender.id);
      const useTools = safeInput.jsonMode ? false : agentCompleteUsesTools(safeInput.model);
      if (useTools) {
        await ensureMcpServersReady(workspaceRoot).catch(() => undefined);
      }
      const toolRegistry = getOrCreateToolRegistry(event.sender.id, workspaceRoot);
      return await completeModelText({
        ...safeInput,
        workspaceRoot,
        toolRegistry,
        useTools,
        // Keys only from main env / secure storage — never from renderer.
        apiKeys: undefined,
      });
    } catch (error) {
      return { ok: false as const, error: safeErrorMessageForUi(error) };
    }
  });


  ipcMain.handle("caval:resolve-model", async (_event, input: { model: string; intent?: RoutingIntent }) => {

    const resolved = await resolveModelSelection(input.model, input.intent ?? "kilocode");

    return { ok: true, resolved };

  });

}


