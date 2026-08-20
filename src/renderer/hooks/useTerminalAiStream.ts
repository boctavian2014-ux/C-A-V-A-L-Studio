import { useCallback, useState } from "react";

import type { TerminalAiCommand } from "../../shared/ai-terminal-contract";
import {
  abortTerminalAiStreams,
  dispatchTerminalAiCommand,
  type TerminalAiDispatchContext,
} from "../ai/terminal-ai-dispatch";
import { useTerminalExplainStore } from "../store/terminal-explain-store";
import { useTerminalSuggestStore } from "../store/terminal-suggest-store";

export type TerminalAiStreamState = "idle" | "loading" | "done" | "error";

/**
 * Shared loading/stop surface for explain + suggest (7c.3).
 * Stop always routes through the same abort cascade (AbortController + abortChatStream).
 */
export function useTerminalAiStream(command: TerminalAiCommand) {
  const explainPanel = useTerminalExplainStore((s) => s.panel);
  const suggestPanel = useTerminalSuggestStore((s) => s.panel);
  const [localState, setLocalState] = useState<TerminalAiStreamState>("idle");

  const panel = command === "explain" ? explainPanel : suggestPanel;
  const state: TerminalAiStreamState =
    panel?.phase === "loading" || panel?.phase === "done" || panel?.phase === "error"
      ? panel.phase
      : localState;

  const start = useCallback(
    (ctx: TerminalAiDispatchContext) => {
      setLocalState("loading");
      dispatchTerminalAiCommand(command, ctx);
    },
    [command]
  );

  const stop = useCallback(() => {
    if (command === "explain") {
      useTerminalExplainStore.getState().stop();
    } else {
      useTerminalSuggestStore.getState().stop();
    }
    setLocalState("idle");
  }, [command]);

  const stopAll = useCallback(() => {
    abortTerminalAiStreams();
    setLocalState("idle");
  }, []);

  return { state, streamId: panel?.streamId ?? null, start, stop, stopAll };
}
