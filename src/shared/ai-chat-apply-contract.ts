/**
 * Pas 6.4 — chat apply parity: proposed writes → diff preview → Accept → apply.
 * Main must not treat proposals as applied until Accept.
 */

import { sanitizeIdeText } from "./ai-context-security";
import { redactSensitiveCommandOutput } from "./command-output-redaction";

export const CHAT_APPLY_MAX_FILE_BYTES = 200_000;
export const CHAT_APPLY_MAX_FILES = 40;
export const CHAT_APPLY_PREVIEW_CHARS = 12_000;

export interface ProposedWrite {
  path: string;
  /** New full file content (may be redacted for preview transport). */
  content: string;
  /** Previous on-disk content when the file already existed; empty string for new files. */
  previousContent?: string;
  isNew: boolean;
}

export interface ProposedWritesPayload {
  streamId: string;
  writes: ProposedWrite[];
}

function utf8ByteLength(text: string): number {
  if (typeof Buffer !== "undefined") return Buffer.byteLength(text, "utf8");
  return new TextEncoder().encode(text).length;
}

export function normalizeProposedPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.?\//, "").trim();
}

/** Redact + bound content for preview/timeline transport (never trust raw secrets). */
export function sanitizeProposedContent(content: string): string {
  let text = sanitizeIdeText(content);
  if (utf8ByteLength(text) > CHAT_APPLY_MAX_FILE_BYTES) {
    text = text.slice(0, CHAT_APPLY_MAX_FILE_BYTES);
  }
  return text;
}

export function sanitizeProposedWrite(write: ProposedWrite): ProposedWrite | null {
  const path = normalizeProposedPath(write.path);
  if (!path || path.includes("..")) return null;
  const content = sanitizeProposedContent(write.content ?? "");
  if (!content.trim()) return null;
  const previousContent =
    typeof write.previousContent === "string"
      ? sanitizeProposedContent(write.previousContent)
      : undefined;
  return {
    path,
    content,
    isNew: write.isNew !== false && !(previousContent && previousContent.length > 0),
    ...(previousContent != null ? { previousContent } : {}),
  };
}

export function sanitizeProposedWrites(writes: ProposedWrite[]): ProposedWrite[] {
  const out: ProposedWrite[] = [];
  for (const raw of writes.slice(0, CHAT_APPLY_MAX_FILES)) {
    const next = sanitizeProposedWrite(raw);
    if (next) out.push(next);
  }
  return out;
}

export function clipProposedContentForPreview(content: string): string {
  const redacted = redactSensitiveCommandOutput(content);
  if (redacted.length <= CHAT_APPLY_PREVIEW_CHARS) return redacted;
  return `${redacted.slice(0, CHAT_APPLY_PREVIEW_CHARS)}\n…`;
}

export function formatProposedWritesHeadline(count: number): string {
  return `${count} modificare(i) propuse — Accept pentru a aplica`;
}
