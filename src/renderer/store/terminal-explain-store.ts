import { create } from "zustand";

import {
  assertTerminalScrollbackWithinCap,
  assertTerminalSelectionWithinCap,
  requestTerminalExplain,
} from "../ai/terminal-explain-client";

export type TerminalExplainPhase = "idle" | "loading" | "done" | "error";

export interface TerminalExplainPanelState {
  phase: TerminalExplainPhase;
  terminalId: string;
  streamId?: string;
  explanation?: string;
  error?: string;
}

interface TerminalExplainStore {
  panel: TerminalExplainPanelState | null;
  abort: AbortController | null;
  setPanel: (panel: TerminalExplainPanelState | null) => void;
  patch: (patch: Partial<TerminalExplainPanelState>) => void;
  clear: () => void;
  stop: () => void;
  explain: (input: {
    terminalId: string;
    selectedText: string;
    scrollbackContext?: string;
  }) => Promise<void>;
}

export const useTerminalExplainStore = create<TerminalExplainStore>((set, get) => ({
  panel: null,
  abort: null,
  setPanel: (panel) => set({ panel }),
  patch: (patch) =>
    set((s) => (s.panel ? { panel: { ...s.panel, ...patch } } : s)),
  clear: () => {
    get().abort?.abort();
    set({ panel: null, abort: null });
  },
  stop: () => {
    const { abort, panel } = get();
    abort?.abort();
    if (panel?.streamId) {
      void window.caval?.abortChatStream?.(panel.streamId);
    }
    set({
      abort: null,
      panel: panel
        ? { ...panel, phase: "error", error: "Explaining cancelled" }
        : null,
    });
  },
  explain: async (input) => {
    const selErr = assertTerminalSelectionWithinCap(input.selectedText);
    if (selErr) {
      set({
        panel: {
          phase: "error",
          terminalId: input.terminalId,
          error: selErr,
        },
        abort: null,
      });
      return;
    }
    const sbErr = assertTerminalScrollbackWithinCap(input.scrollbackContext);
    if (sbErr) {
      set({
        panel: {
          phase: "error",
          terminalId: input.terminalId,
          error: sbErr,
        },
        abort: null,
      });
      return;
    }

    get().abort?.abort();
    const controller = new AbortController();
    set({
      abort: controller,
      panel: {
        phase: "loading",
        terminalId: input.terminalId,
      },
    });

    const { streamId, result } = await requestTerminalExplain({
      terminalId: input.terminalId,
      selectedText: input.selectedText,
      scrollbackContext: input.scrollbackContext,
      abortSignal: controller.signal,
    });

    if (controller.signal.aborted) {
      set((s) =>
        s.panel?.terminalId === input.terminalId
          ? {
              panel: {
                ...s.panel,
                streamId,
                phase: "error",
                error: "Explaining cancelled",
              },
              abort: null,
            }
          : { abort: null }
      );
      return;
    }

    if (!result.success || !result.explanation) {
      set({
        abort: null,
        panel: {
          phase: "error",
          terminalId: input.terminalId,
          streamId,
          error: result.error ?? "Explain failed",
        },
      });
      return;
    }

    set({
      abort: null,
      panel: {
        phase: "done",
        terminalId: input.terminalId,
        streamId,
        explanation: result.explanation,
      },
    });
  },
}));
