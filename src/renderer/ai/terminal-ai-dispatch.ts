/**
 * Pas 7c.3 — central dispatcher for terminal AI palette commands.
 */

import type { TerminalAiCommand } from "../../shared/ai-terminal-contract";
import { useTerminalExplainStore } from "../store/terminal-explain-store";
import { useTerminalSuggestStore } from "../store/terminal-suggest-store";

export interface TerminalAiDispatchContext {
  terminalId: string;
  selectedText?: string;
  scrollbackContext?: string;
  errorOutput?: string;
}

export function dispatchTerminalAiCommand(
  command: TerminalAiCommand,
  ctx: TerminalAiDispatchContext
): void {
  if (command === "explain") {
    const text = (ctx.selectedText ?? "").trim();
    if (!text) return;
    void useTerminalExplainStore.getState().explain({
      terminalId: ctx.terminalId,
      selectedText: text,
      scrollbackContext: ctx.scrollbackContext,
    });
    return;
  }

  if (command === "suggest-fix") {
    const errorOutput = (ctx.errorOutput ?? ctx.selectedText ?? "").trim();
    if (!errorOutput) return;
    void useTerminalSuggestStore.getState().suggest({
      context: "error",
      terminalId: ctx.terminalId,
      errorOutput,
    });
  }
}

export function abortTerminalAiStreams(): void {
  useTerminalExplainStore.getState().stop();
  useTerminalSuggestStore.getState().stop();
}
