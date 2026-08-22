/**
 * Pas 5.4 — unified activity timeline for assistant messages.
 * Events travel on the existing stream channel as `{ type: "timeline", event }`.
 */

import { redactSensitiveCommandOutput } from "./command-output-redaction";

export type TimelineEventType =
  | "reasoning"
  | "tool_call"
  | "tool_result"
  | "file_write"
  | "error";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  timestamp: number;
  label: string;
  detail?: string;
  toolName?: string;
  filePath?: string;
  success?: boolean;
}

export type TimelineEventInput = Omit<TimelineEvent, "id" | "timestamp"> & {
  id?: string;
  timestamp?: number;
};

export const TIMELINE_LABEL_MAX = 160;
export const TIMELINE_DETAIL_MAX = 200;

export function clipTimelineText(text: string, max: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, Math.max(0, max - 1))}…`;
}

/** Sanitize + bound a timeline event before it enters the stream / UI. */
export function sanitizeTimelineEvent(input: TimelineEventInput): TimelineEvent {
  const id =
    typeof input.id === "string" && input.id.trim()
      ? input.id.trim().slice(0, 80)
      : `tl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const timestamp =
    typeof input.timestamp === "number" && Number.isFinite(input.timestamp)
      ? input.timestamp
      : Date.now();

  const label = clipTimelineText(
    redactSensitiveCommandOutput(String(input.label ?? "")),
    TIMELINE_LABEL_MAX
  );

  const detailRaw =
    typeof input.detail === "string" && input.detail.trim()
      ? redactSensitiveCommandOutput(input.detail)
      : undefined;
  const detail = detailRaw ? clipTimelineText(detailRaw, TIMELINE_DETAIL_MAX) : undefined;

  const toolName =
    typeof input.toolName === "string" && input.toolName.trim()
      ? input.toolName.trim().slice(0, 96)
      : undefined;
  const filePath =
    typeof input.filePath === "string" && input.filePath.trim()
      ? input.filePath.trim().replace(/\\/g, "/").slice(0, 512)
      : undefined;

  return {
    id,
    type: input.type,
    timestamp,
    label: label || input.type,
    ...(detail ? { detail } : {}),
    ...(toolName ? { toolName } : {}),
    ...(filePath ? { filePath } : {}),
    ...(typeof input.success === "boolean" ? { success: input.success } : {}),
  };
}

export function summarizeToolDetail(detail: string | undefined, success: boolean): string | undefined {
  if (!detail?.trim()) return success ? undefined : "failed";
  const redacted = redactSensitiveCommandOutput(detail);
  const firstLine = redacted.split(/\r?\n/).find((l) => l.trim())?.trim() ?? redacted.trim();
  return clipTimelineText(firstLine, TIMELINE_DETAIL_MAX);
}
