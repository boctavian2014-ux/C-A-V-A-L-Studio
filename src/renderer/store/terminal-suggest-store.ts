import { create } from "zustand";

import type { SuggestedCommand, TerminalSuggestContext } from "../../shared/ai-terminal-contract";
import { tActive } from "../../../ai/i18n/active-locale";
import {
  assertSuggestErrorWithinCap,
  insertCommandIntoTerminalPrompt,
  requestTerminalSuggest,
} from "../ai/terminal-suggest-client";
import { dispatchTerminalPanelTab } from "../terminal/terminal-events";

export type TerminalSuggestPhase = "idle" | "loading" | "done" | "error";

export interface TerminalSuggestPanelState {
  phase: TerminalSuggestPhase;
  context: TerminalSuggestContext;
  terminalId?: string;
  streamId?: string;
  commands: SuggestedCommand[];
  error?: string;
}

interface TerminalSuggestStore {
  panel: TerminalSuggestPanelState | null;
  abort: AbortController | null;
  setPanel: (panel: TerminalSuggestPanelState | null) => void;
  clear: () => void;
  dismissCommand: (id: string) => void;
  stop: () => void;
  insertCommand: (cmd: SuggestedCommand) => Promise<boolean>;
  suggest: (input: {
    context: TerminalSuggestContext;
    terminalId?: string;
    errorOutput?: string;
    userQuery?: string;
  }) => Promise<void>;
  showCommands: (commands: SuggestedCommand[], context?: TerminalSuggestContext) => void;
}

export const useTerminalSuggestStore = create<TerminalSuggestStore>((set, get) => ({
  panel: null,
  abort: null,
  setPanel: (panel) => set({ panel }),
  clear: () => {
    get().abort?.abort();
    set({ panel: null, abort: null });
  },
  dismissCommand: (id) =>
    set((s) => {
      if (!s.panel) return s;
      const commands = s.panel.commands.filter((c) => c.id !== id);
      if (!commands.length) return { panel: null, abort: null };
      return { panel: { ...s.panel, commands } };
    }),
  stop: () => {
    const { abort, panel } = get();
    abort?.abort();
    if (panel?.streamId) {
      void window.caval?.abortChatStream?.(panel.streamId);
    }
    set({
      abort: null,
      panel: panel
        ? { ...panel, phase: "error", error: "Suggest cancelled", commands: [] }
        : null,
    });
  },
  insertCommand: async (cmd) => {
    if (cmd.requiresConfirmation) {
      const ok = window.confirm(
        tActive("dialog.insertSideEffects", { command: cmd.command })
      );
      if (!ok) return false;
    }
    dispatchTerminalPanelTab("terminal");
    insertCommandIntoTerminalPrompt(cmd.command);
    get().dismissCommand(cmd.id);
    return true;
  },
  showCommands: (commands, context = "user-query") => {
    if (!commands.length) return;
    set({
      abort: null,
      panel: {
        phase: "done",
        context,
        commands,
      },
    });
    dispatchTerminalPanelTab("terminal");
  },
  suggest: async (input) => {
    const errCap = assertSuggestErrorWithinCap(input.errorOutput);
    if (errCap) {
      set({
        panel: {
          phase: "error",
          context: input.context,
          terminalId: input.terminalId,
          commands: [],
          error: errCap,
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
        context: input.context,
        terminalId: input.terminalId,
        commands: [],
      },
    });
    dispatchTerminalPanelTab("terminal");

    const { streamId, result } = await requestTerminalSuggest({
      ...input,
      abortSignal: controller.signal,
    });

    if (controller.signal.aborted) {
      set({
        abort: null,
        panel: {
          phase: "error",
          context: input.context,
          terminalId: input.terminalId,
          streamId,
          commands: [],
          error: "Suggest cancelled",
        },
      });
      return;
    }

    if (!result.success || !result.commands?.length) {
      set({
        abort: null,
        panel: {
          phase: "error",
          context: input.context,
          terminalId: input.terminalId,
          streamId,
          commands: [],
          error: result.error ?? "Suggest failed",
        },
      });
      return;
    }

    set({
      abort: null,
      panel: {
        phase: "done",
        context: input.context,
        terminalId: input.terminalId,
        streamId,
        commands: result.commands,
      },
    });
  },
}));
