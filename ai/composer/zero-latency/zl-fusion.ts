import { warmCacheManager } from "../../context/warm-cache/warm-cache-manager";
import { warmCacheStore } from "../../context/warm-cache/warm-cache-store";
import type { WarmCacheEntry } from "../../context/warm-cache/warm-cache-types";
import { zeroLatencyComposer } from "./zl-composer";
import { zeroLatencyCache } from "./zl-cache";
import { zlModelPreloader } from "./zl-model-preloader";
import { zlPreplanner } from "./zl-preplanner";
import type { ZLComposerSnapshot, ZLPartialPlan, ZLSignals } from "./zl-types";
import { ZL_LOG_PREFIX } from "./zl-types";
import { loadZeroLatencyConfig } from "./zl-config";

export interface ZLModelBundle {
  warmedModels: string[];
  workspaceRoot: string;
}

export interface ZLChatPrep {
  warmContext: string;
  partialPlan?: ZLPartialPlan;
  modelBundle: ZLModelBundle;
}

export interface ZLFusionSnapshot {
  composer: ZLComposerSnapshot;
  warm: ReturnType<typeof warmCacheManager.snapshot>;
  modelBundle: ZLModelBundle;
}

const WARM_MARKER = "Context Zero-Latency (warm cache)";

function formatWarmEntry(entry: WarmCacheEntry): string {
  const symbols = entry.symbols.slice(0, 10).map((s) => s.name).join(", ");
  const keywords = entry.semantic?.keywords?.slice(0, 12).join(", ") ?? "";
  const snippet = entry.document?.chunks?.[0]?.text?.slice(0, 1_200) ?? "";
  return [
    `File: ${entry.path}`,
    symbols ? `Symbols: ${symbols}` : "",
    keywords ? `Keywords: ${keywords}` : "",
    snippet ? `\`\`\`\n${snippet}\n\`\`\`` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Build context text from warm cache + ZL cache (primary source for chat/composer). */
export function buildWarmContextBlock(input: {
  workspaceRoot: string;
  objectiveDraft?: string;
  activeFile?: string;
  openFiles?: string[];
  maxFiles?: number;
}): string {
  const maxFiles = input.maxFiles ?? 8;
  const zlEntry = zeroLatencyCache.get(input.workspaceRoot, input.objectiveDraft ?? "");
  const pathSet = new Set<string>();

  if (input.activeFile) pathSet.add(input.activeFile);
  for (const file of input.openFiles ?? []) pathSet.add(file);
  for (const file of zlEntry?.context?.relevantFiles ?? []) pathSet.add(file);
  for (const step of zlEntry?.partialPlan?.plan.steps ?? []) {
    for (const file of step.files) pathSet.add(file);
  }

  const parts: string[] = [];

  if (zlEntry?.partialPlan) {
    const plan = zlEntry.partialPlan;
    parts.push(
      [
        `Plan parțial Zero-Latency (confidență ${Math.round(plan.confidence * 100)}%):`,
        ...plan.plan.steps.map((s) => `- ${s.title}: ${s.rationale}`),
      ].join("\n")
    );
  }

  let paths = Array.from(pathSet);
  if (paths.length === 0) {
    paths = warmCacheManager
      .snapshot()
      .entries.sort((a, b) => b.lastAccessed - a.lastAccessed)
      .slice(0, maxFiles)
      .map((e) => e.path);
  }

  for (const filePath of paths.slice(0, maxFiles)) {
    const entry = warmCacheStore.get(filePath);
    if (entry) parts.push(formatWarmEntry(entry));
  }

  return parts.join("\n\n---\n\n");
}

/** Fast read-only peek — no preplan, capped size (used on chat hot path). */
export function peekWarmContext(input: {
  workspaceRoot: string;
  objectiveDraft?: string;
  activeFile?: string;
  openFiles?: string[];
  maxFiles?: number;
  maxChars?: number;
}): string {
  const block = buildWarmContextBlock({
    ...input,
    maxFiles: input.maxFiles ?? 2,
  });
  const maxChars = input.maxChars ?? 2_500;
  return block.length > maxChars ? `${block.slice(0, maxChars)}\n...(truncat)` : block;
}

export function getModelBundle(workspaceRoot: string, objectiveDraft = ""): ZLModelBundle {
  return {
    workspaceRoot,
    warmedModels: zlModelPreloader.getModelBundle(workspaceRoot, objectiveDraft),
  };
}

/** Inject warm context into pre-built chat messages (renderer path). */
export function injectWarmContextIntoMessages<
  T extends { role: string; content: string }
>(messages: T[], warmBlock: string): T[] {
  if (!warmBlock.trim()) return messages;
  if (messages.some((m) => m.content.includes(WARM_MARKER))) return messages;

  const injection = `${WARM_MARKER}:\n${warmBlock}`;
  const msgs = [...messages];
  const lastUserIdx = [...msgs].reverse().findIndex((m) => m.role === "user");
  if (lastUserIdx < 0) {
    msgs.push({ role: "user", content: injection } as T);
    return msgs;
  }

  const idx = msgs.length - 1 - lastUserIdx;
  msgs[idx] = {
    ...msgs[idx]!,
    content: `${msgs[idx]!.content}\n\n---\n${injection}`,
  };
  return msgs;
}

export class ZeroLatencyFusion {
  onWorkspaceOpen(workspaceRoot: string, openFiles: string[] = []): void {
    console.log(`${ZL_LOG_PREFIX} fusion workspace open ${workspaceRoot}`);
    warmCacheManager.configureWorkspace(workspaceRoot);
    const focus = openFiles.slice(0, 5);
    if (focus.length > 0) {
      void warmCacheManager.ensureWarm({
        workspaceRoot,
        files: focus.map((p) => ({ path: p })),
        activeFile: focus[0],
        reason: "startup",
      }).catch(() => undefined);
    }
    zeroLatencyComposer.prepare({
      workspaceRoot,
      openFiles: focus,
      activeFile: focus[0],
    });
  }

  onProjectChange(workspaceRoot: string): void {
    warmCacheManager.onProjectChange(workspaceRoot);
    zeroLatencyCache.clearWorkspace(workspaceRoot);
    zeroLatencyComposer.prepare({ workspaceRoot });
  }

  onFileOpen(filePath: string, content?: string, workspaceRoot?: string): void {
    warmCacheManager.onFileOpen(filePath, content);
    if (workspaceRoot) {
      zeroLatencyComposer.prepare({
        workspaceRoot,
        activeFile: filePath,
        openFiles: [filePath],
      });
    }
  }

  onFileChange(filePath: string, content: string, workspaceRoot?: string): void {
    warmCacheManager.onFileChange(filePath, content);
    if (workspaceRoot) {
      zeroLatencyComposer.prepare({
        workspaceRoot,
        activeFile: filePath,
        openFiles: [filePath],
      });
    }
  }

  onPanelOpen(signals: ZLSignals): string {
    console.log(`${ZL_LOG_PREFIX} fusion panel open`);
    return zeroLatencyComposer.prepare(signals);
  }

  prepare(signals: ZLSignals): string {
    return zeroLatencyComposer.prepare(signals);
  }

  cancel(tokenId: string): void {
    zeroLatencyComposer.cancel(tokenId);
  }

  /** Called on Enter — finalize plan + return warm context bundle. */
  async completeForChat(signals: ZLSignals): Promise<ZLChatPrep> {
    const cfg = loadZeroLatencyConfig(signals.workspaceRoot);
    if (cfg.draftPlan !== 'off') {
      if (cfg.draftPlan === 'stub') {
        zlPreplanner.preplan(signals);
      } else {
        await zlPreplanner.preplanAsync(signals, cfg.draftPlan);
      }
    }
    const warmContext = buildWarmContextBlock({
      workspaceRoot: signals.workspaceRoot,
      objectiveDraft: signals.objectiveDraft,
      activeFile: signals.activeFile,
      openFiles: signals.openFiles,
      maxFiles: cfg.maxWarmFiles,
    });
    const cached = zeroLatencyComposer.getCached(
      signals.workspaceRoot,
      signals.objectiveDraft ?? ""
    );
    return {
      warmContext,
      partialPlan: cached?.partialPlan,
      modelBundle: getModelBundle(signals.workspaceRoot, signals.objectiveDraft),
    };
  }

  snapshot(workspaceRoot: string, objectiveDraft = ""): ZLFusionSnapshot {
    return {
      composer: zeroLatencyComposer.snapshot(),
      warm: warmCacheManager.snapshot(),
      modelBundle: getModelBundle(workspaceRoot, objectiveDraft),
    };
  }
}

export const zeroLatencyFusion = new ZeroLatencyFusion();
