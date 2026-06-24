import type { PipelineEvent } from "../../components/ui/logicflow/types";
import { confirmStore } from "../../components/ui/confirm-store";

interface CavalDebugBridge {
  suggestDebugFix?: (request: {
    message: string;
    nodeId?: string;
    meta?: Record<string, unknown>;
  }) => Promise<{ commands: string[]; explanation: string; autoApply: boolean }>;
  replayTool?: (request: {
    toolCallId: string;
    tool: string;
    input?: unknown;
    confirm: boolean;
  }) => Promise<{ ok: boolean; output?: unknown; error?: string }>;
  applyFixAndRerun?: (request: {
    message: string;
    commands: string[];
  }) => Promise<{ ok: boolean }>;
}

const caval = (window as unknown as { caval?: CavalDebugBridge }).caval;

export const debugPanelApi = {
  async explainError(event: PipelineEvent): Promise<{ explanation: string; suggestions: string[] }> {
    if (event.type !== "error.occurred") {
      return { explanation: "No error context.", suggestions: [] };
    }
    const response = await caval?.suggestDebugFix?.({
      message: event.message,
      nodeId: event.nodeId,
      meta: event.meta
    });
    return {
      explanation: response?.explanation ?? event.message,
      suggestions: response?.commands ?? []
    };
  },

  async suggestFix(event: PipelineEvent): Promise<{ commands: string[]; autoApply: boolean; explanation: string }> {
    if (event.type !== "error.occurred") {
      return { commands: [], autoApply: false, explanation: "" };
    }
    const response = await caval?.suggestDebugFix?.({
      message: event.message,
      nodeId: event.nodeId,
      meta: event.meta
    });
    return {
      commands: response?.commands ?? [],
      autoApply: response?.autoApply ?? false,
      explanation: response?.explanation ?? event.message
    };
  },

  async applyFixAndRerun(event: PipelineEvent, commands: string[]): Promise<{ ok: boolean }> {
    if (event.type !== "error.occurred") {
      return { ok: false };
    }
    return caval?.applyFixAndRerun?.({ message: event.message, commands }) ?? { ok: false };
  },

  async replayTool(event: PipelineEvent, replayId?: string): Promise<{ ok: boolean; output?: unknown; error?: string }> {
    if (event.type !== "tool.call") {
      return { ok: false };
    }
    const decision = await confirmStore.request({
      title: `Replay tool: ${event.tool}`,
      message: `Replay tool "${event.tool}" in sandbox?`,
      showAutoApply: false
    });
    if (!decision.confirmed) return { ok: false };
    const result = await caval?.replayTool?.({
      toolCallId: replayId ?? event.id,
      tool: event.tool,
      input: event.input,
      confirm: true
    });
    return { ok: result?.ok ?? false, output: result?.output, error: result?.error };
  }
};
