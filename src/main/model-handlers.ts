import { ipcMain, type WebContents } from "electron";
import { AIClient } from "../../ai/ai-client";
import { buildModelCatalog, invalidateCatalogCache } from "../../ai/models/model-catalog";
import { clearOpenRouterCache } from "../../ai/models/openrouter-catalog";
import {
  resolveModelSelection,
  getAutoFreeModelCandidates,
  isOllamaReachable,
} from "../../ai/models/auto-router";
import { isAutoTier } from "../../ai/models/model-catalog";
import { getModelProfile } from "../../ai/model-profiles";
import type { RoutingIntent, ModelRequest } from "../../ai/types";

const aiClient = new AIClient();

export interface CavalChatStreamRequest {
  message: string;
  model: string;
  mode?: "ask" | "plan" | "code" | "architect" | "debug";
  intent?: RoutingIntent;
  context?: {
    filePath?: string;
    fileContent?: string;
    projectContext?: string;
    mentions?: string[];
  };
  streamId: string;
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

function systemPromptForMode(mode?: string): string {
  switch (mode) {
    case "plan":
    case "architect":
      return "You are Caval AI in Architect mode. Produce structured plans before code changes.";
    case "debug":
      return "You are Caval AI in Debug mode. Analyze errors, trace root causes, and suggest fixes.";
    case "code":
      return "You are Caval AI in Code mode. Write production-ready code with minimal prose.";
    default:
      return "You are Caval AI, a helpful coding assistant integrated in Caval Studio.";
  }
}

function buildUserContent(request: CavalChatStreamRequest): string {
  const parts = [request.message];
  if (request.context?.filePath) {
    parts.push(`\nActive file: ${request.context.filePath}`);
  }
  if (request.context?.fileContent) {
    parts.push(`\n\n${request.context.fileContent.slice(0, 16_000)}`);
  }
  if (request.context?.projectContext) {
    parts.push(`\n\nProject context:\n${request.context.projectContext.slice(0, 12_000)}`);
  }
  if (request.context?.mentions?.length) {
    parts.push(`\n\nReferenced files: ${request.context.mentions.join(", ")}`);
  }
  return parts.join("");
}

function buildModelRequest(
  request: CavalChatStreamRequest,
  streamId: string,
  modelId: string,
  selectionId: string
): ModelRequest {
  const intent = request.intent ?? modeToIntent(request.mode);
  const capability =
    request.mode === "plan" || request.mode === "architect"
      ? "planning"
      : request.mode === "debug"
        ? "debug"
        : "chat";

  return {
    prompt: buildUserContent(request),
    system: systemPromptForMode(request.mode),
    capability,
    intent,
    stream: true,
    metadata: {
      requestId: streamId,
      preferredModel: modelId,
      resolvedModel: modelId,
      selectionId,
    },
    messages: [
      { role: "system", content: systemPromptForMode(request.mode) },
      { role: "user", content: buildUserContent(request) },
    ],
  };
}

async function* streamModel(request: ModelRequest): AsyncIterable<string> {
  yield* aiClient.stream(request);
}

async function streamToRenderer(
  sender: WebContents,
  streamId: string,
  request: CavalChatStreamRequest
): Promise<void> {
  const intent = request.intent ?? modeToIntent(request.mode);
  const resolved = await resolveModelSelection(request.model, intent);

  const modelIdsToTry =
    request.model === "caval-auto/free"
      ? await getAutoFreeModelCandidates()
      : isAutoTier(request.model) && getModelProfile(resolved.modelId)?.provider === "open_source"
        ? [resolved.modelId, ...(await getAutoFreeModelCandidates()).filter((id) => id !== resolved.modelId)]
        : [resolved.modelId];

  const reachable = await isOllamaReachable();
  if (request.model === "caval-auto/free" && !reachable) {
    sender.send("caval:ai-stream-chunk", {
      streamId,
      type: "error",
      error:
        "Ollama nu rulează. Pornește Ollama (ollama serve), apoi: ollama pull qwen2.5-coder:7b",
    });
    return;
  }

  const errors: string[] = [];

  for (const modelId of modelIdsToTry) {
    sender.send("caval:ai-stream-chunk", {
      streamId,
      type: "meta",
      resolvedModel: modelId,
      reason: `Încerc model: ${modelId}`,
    });

    const profile = getModelProfile(modelId);
    const modelRequest = buildModelRequest(request, streamId, modelId, request.model);

    try {
      for await (const delta of streamModel(modelRequest)) {
        sender.send("caval:ai-stream-chunk", { streamId, type: "delta", delta });
      }

      sender.send("caval:ai-stream-chunk", {
        streamId,
        type: "done",
        model: modelId,
        provider: profile?.provider ?? "open_source",
      });
      return;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${modelId}: ${msg}`);
    }
  }

  sender.send("caval:ai-stream-chunk", {
    streamId,
    type: "error",
    error: [
      "Niciun model local nu a răspuns.",
      "",
      errors.join("\n"),
      "",
      "Verifică: ollama serve rulează, apoi ollama pull qwen2.5-coder:7b",
    ].join("\n"),
  });
}

export function registerModelHandlers(): void {
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
    void streamToRenderer(event.sender, request.streamId, request);
    return { ok: true, started: true };
  });

  ipcMain.handle("caval:resolve-model", async (_event, input: { model: string; intent?: RoutingIntent }) => {
    const resolved = await resolveModelSelection(input.model, input.intent ?? "kilocode");
    return { ok: true, resolved };
  });
}
