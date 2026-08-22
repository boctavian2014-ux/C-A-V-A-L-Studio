/**
 * Pas 7c.3 — single redaction entry for all terminal AI surfaces.
 * Reuses M5/M6 `redactSensitiveCommandOutput` — does not invent a new secret scanner.
 *
 * Caps policy (documented once):
 * - selection / command → reject when over maxBytes (caller maps to user error)
 * - scrollback / response → truncate with [TRUNCATED] marker
 */

import { redactSensitiveCommandOutput } from "../../shared/command-output-redaction";
import {
  sanitizeTerminalExplainText,
  TERMINAL_EXPLAIN_MAX_RESPONSE_BYTES,
  TERMINAL_EXPLAIN_MAX_SCROLLBACK_BYTES,
  TERMINAL_EXPLAIN_MAX_SELECTION_BYTES,
  utf8ByteLength,
} from "../../shared/ai-terminal-contract";

export type TerminalRedactionContext = "selection" | "scrollback" | "response" | "command";

export interface TerminalRedactionOptions {
  maxBytes: number;
  context: TerminalRedactionContext;
}

export class TerminalContentTooLargeError extends Error {
  readonly context: TerminalRedactionContext;
  readonly maxBytes: number;

  constructor(context: TerminalRedactionContext, maxBytes: number) {
    super(`${context} too large (max ${maxBytes} bytes)`);
    this.name = "TerminalContentTooLargeError";
    this.context = context;
    this.maxBytes = maxBytes;
  }
}

export function defaultMaxBytesForContext(context: TerminalRedactionContext): number {
  switch (context) {
    case "selection":
      return TERMINAL_EXPLAIN_MAX_SELECTION_BYTES;
    case "scrollback":
      return TERMINAL_EXPLAIN_MAX_SCROLLBACK_BYTES;
    case "response":
      return TERMINAL_EXPLAIN_MAX_RESPONSE_BYTES;
    case "command":
      return 400;
    default:
      return TERMINAL_EXPLAIN_MAX_SELECTION_BYTES;
  }
}

function capUtf8(text: string, maxBytes: number): string {
  if (utf8ByteLength(text) <= maxBytes) return text;
  let end = Math.min(text.length, maxBytes);
  while (end > 0 && utf8ByteLength(text.slice(0, end)) > maxBytes) {
    end = Math.floor(end * 0.9);
  }
  return text.slice(0, Math.max(0, end));
}

/**
 * Redact secrets then enforce size policy for the given context.
 * @throws {TerminalContentTooLargeError} for selection/command over maxBytes
 */
export function redactTerminalContent(
  text: string,
  options: TerminalRedactionOptions
): string {
  const redacted = redactSensitiveCommandOutput(text.replace(/\r\n/g, "\n"));
  if (utf8ByteLength(redacted) <= options.maxBytes) return redacted;

  if (options.context === "selection" || options.context === "command") {
    throw new TerminalContentTooLargeError(options.context, options.maxBytes);
  }

  const marker = "\n[TRUNCATED]";
  const budget = Math.max(0, options.maxBytes - utf8ByteLength(marker));
  return `${capUtf8(redacted, budget)}${marker}`;
}

/** Safe helper: never throws — returns null when empty/invalid after redact+cap. */
export function redactTerminalResponse(text: string | undefined | null): string | null {
  return sanitizeTerminalExplainText(text);
}
