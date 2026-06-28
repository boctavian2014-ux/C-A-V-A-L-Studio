import { ipcMain } from "electron";

import {
  zeroLatencyFusion,
  injectWarmContextIntoMessages,
  peekWarmContext,
  buildWarmContextBlock,
} from "../../ai/composer/zero-latency/zl-fusion";
import { zeroLatencyComposer } from "../../ai/composer/zero-latency/zl-composer";
import { formatPartialPlanPreview } from "../../ai/composer/zero-latency/zl-plan-format";
import {
  isFrontierSelection,
  loadZeroLatencyConfig,
} from "../../ai/composer/zero-latency/zl-config";
import type { ZLSignals } from "../../ai/composer/zero-latency/zl-types";
import { getModelProfile } from "../../ai/model-profiles";
import { warmOpenRouterConnection } from "../../ai/models/openrouter-warm";
import { resolveModelSelection } from "../../ai/models/auto-router";
import type { ModelSelectionId } from "../../ai/models/model-catalog";
import { preloadManager } from "../../ai/preload/preload-manager";

export interface CavalChatPrepareInput {
  workspaceRoot: string;
  objectiveDraft: string;
  model: string;
  draftHash: string;
  activeFile?: string;
  openFiles?: string[];
}

const prepareTokens = new Map<string, string>();

export function registerZLHandlers(getWorkspaceRoot: (senderId: number) => string): void {
  ipcMain.handle("caval:zl-prepare", async (event, signals: ZLSignals) => {
    const root = signals.workspaceRoot || getWorkspaceRoot(event.sender.id);
    const tokenId = zeroLatencyFusion.prepare({ ...signals, workspaceRoot: root });
    return { ok: true, tokenId };
  });

  ipcMain.handle("caval:chat-prepare", async (event, input: CavalChatPrepareInput) => {
    const root = input.workspaceRoot || getWorkspaceRoot(event.sender.id);
    const draftHash = input.draftHash;
    const cfg = loadZeroLatencyConfig(root);

    if (!cfg.enabled) {
      return { ok: true, draftHash, warmContextReady: false, tokenId: undefined };
    }

    const prevToken = prepareTokens.get(draftHash);
    if (prevToken) {
      zeroLatencyFusion.cancel(prevToken);
    }

    warmOpenRouterConnection(false, "stepfun-step-3-7-flash");

    const signals: ZLSignals = {
      workspaceRoot: root,
      objectiveDraft: input.objectiveDraft,
      activeFile: input.activeFile,
      openFiles: input.openFiles,
      selectedModel: input.model,
    };

    const tokenId = zeroLatencyFusion.prepare(signals);
    prepareTokens.set(draftHash, tokenId);

    let resolvedModelHint: string | undefined;
    try {
      const resolved = await resolveModelSelection(input.model as ModelSelectionId, "fallback");
      resolvedModelHint = resolved.modelId;

      if (cfg.frontierPrewarm && isFrontierSelection(input.model)) {
        void preloadManager.warmModel(resolved.modelId, "chat");
        void preloadManager.warmModel("nex-n2-pro", "chat");
        const profile = getModelProfile(resolved.modelId);
        if (profile?.providerModelId) {
          warmOpenRouterConnection(true, resolved.modelId);
        }
      } else {
        void preloadManager.warmModel(resolved.modelId, "chat");
        warmOpenRouterConnection(false, resolved.modelId);
      }
    } catch {
      /* ignore */
    }

    const warmContext = peekWarmContext({
      workspaceRoot: root,
      objectiveDraft: input.objectiveDraft,
      activeFile: input.activeFile,
      openFiles: input.openFiles,
      maxFiles: cfg.maxWarmFiles,
      maxChars: cfg.maxWarmChars,
    });

    const cached = zeroLatencyComposer.getCached(root, input.objectiveDraft);
    const partialPlanPreview = cached?.partialPlan
      ? formatPartialPlanPreview(cached.partialPlan)
      : undefined;

    return {
      ok: true,
      draftHash,
      warmContextReady: warmContext.trim().length > 0,
      resolvedModelHint,
      partialPlanPreview,
      tokenId,
    };
  });

  ipcMain.handle("caval:zl-cancel", (_event, tokenId: string) => {
    zeroLatencyFusion.cancel(tokenId);
    return { ok: true };
  });

  ipcMain.handle(
    "caval:zl-panel-open",
    async (event, input: Omit<ZLSignals, "workspaceRoot"> & { workspaceRoot?: string }) => {
      const workspaceRoot = input.workspaceRoot || getWorkspaceRoot(event.sender.id);
      const tokenId = zeroLatencyFusion.onPanelOpen({ ...input, workspaceRoot });
      return { ok: true, tokenId };
    }
  );

  ipcMain.handle(
    "caval:zl-snapshot",
    async (event, input?: { workspaceRoot?: string; objectiveDraft?: string }) => {
      const workspaceRoot = input?.workspaceRoot || getWorkspaceRoot(event.sender.id);
      return {
        ok: true,
        snapshot: zeroLatencyFusion.snapshot(workspaceRoot, input?.objectiveDraft),
      };
    }
  );

  ipcMain.handle(
    "caval:zl-complete-chat",
    async (event, signals: ZLSignals) => {
      const root = signals.workspaceRoot || getWorkspaceRoot(event.sender.id);
      const prep = await zeroLatencyFusion.completeForChat({ ...signals, workspaceRoot: root });
      return { ok: true, prep };
    }
  );
}

/** Enrich chat stream request with Zero-Latency warm context (main process). */
export function enrichChatWithZeroLatency<
  T extends {
    message: string;
    workspaceRoot?: string;
    messages?: Array<{ role: string; content: string }>;
    context?: { filePath?: string; fileContent?: string; projectContext?: string; mentions?: string[] };
  }
>(request: T, workspaceRoot: string): T {
  if ((request.context?.fileContent?.length ?? 0) > 400) return request;

  const existing = request.context?.projectContext ?? '';
  if (existing.includes('Context Zero-Latency')) return request;

  const cfg = loadZeroLatencyConfig(workspaceRoot);
  const warmContext =
    existing.trim().length > 0
      ? existing
      : buildWarmContextBlock({
          workspaceRoot,
          objectiveDraft: request.message,
          activeFile: request.context?.filePath,
          openFiles: request.context?.mentions,
          maxFiles: cfg.maxWarmFiles,
        });

  const capped =
    warmContext.length > cfg.maxWarmChars
      ? `${warmContext.slice(0, cfg.maxWarmChars)}\n...(truncat)`
      : warmContext;

  if (!capped.trim()) return request;

  const lastUser = [...(request.messages ?? [])].reverse().find((m) => m.role === "user");
  if (lastUser?.content.includes(capped.slice(0, 80))) return request;

  let messages = request.messages;
  if (messages?.length) {
    messages = injectWarmContextIntoMessages(messages, capped);
  }

  return {
    ...request,
    messages,
    context: {
      ...request.context,
      projectContext: [request.context?.projectContext, capped].filter(Boolean).join("\n\n---\n\n"),
    },
  };
}

export { zeroLatencyFusion };
