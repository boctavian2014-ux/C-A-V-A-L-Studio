/**
 * Pas 7e.3 — granular AI preferences (per workspace).
 * Preferences only — never relaxes M5/M6 safety gates (diff, undo, refactor confirm).
 */

export type AiRedactionLevel = "strict" | "standard" | "minimal";
export type AiTimelineDetail = "compact" | "verbose";

export type AiConfigurableToolName =
  | "get_problems"
  | "git_status"
  | "run_task"
  | "open_preview";

export interface AiSettings {
  toolsEnabled: Record<AiConfigurableToolName, boolean>;
  redactionLevel: AiRedactionLevel;
  /** Soft cap for persisted message text (KB). Clamped 8–128 in main. */
  messageCapKB: number;
  /** Soft cap for written_files snapshots (KB). Clamped 16–256 in main. */
  snapshotCapKB: number;
  timelineDetail: AiTimelineDetail;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  toolsEnabled: {
    get_problems: true,
    git_status: true,
    run_task: true,
    open_preview: true,
  },
  redactionLevel: "standard",
  messageCapKB: 32,
  snapshotCapKB: 64,
  timelineDetail: "compact",
};

export const AI_SETTINGS_MESSAGE_CAP_MIN_KB = 8;
export const AI_SETTINGS_MESSAGE_CAP_MAX_KB = 128;
export const AI_SETTINGS_SNAPSHOT_CAP_MIN_KB = 16;
export const AI_SETTINGS_SNAPSHOT_CAP_MAX_KB = 256;

export interface AiSettingsApi {
  getSettings(): Promise<AiSettings>;
  updateSettings(partial: Partial<AiSettings>): Promise<AiSettings>;
  resetSettings(): Promise<AiSettings>;
}

export function isAiRedactionLevel(value: unknown): value is AiRedactionLevel {
  return value === "strict" || value === "standard" || value === "minimal";
}

export function isAiTimelineDetail(value: unknown): value is AiTimelineDetail {
  return value === "compact" || value === "verbose";
}

export function clampMessageCapKB(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AI_SETTINGS.messageCapKB;
  return Math.max(
    AI_SETTINGS_MESSAGE_CAP_MIN_KB,
    Math.min(AI_SETTINGS_MESSAGE_CAP_MAX_KB, Math.round(value))
  );
}

export function clampSnapshotCapKB(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AI_SETTINGS.snapshotCapKB;
  return Math.max(
    AI_SETTINGS_SNAPSHOT_CAP_MIN_KB,
    Math.min(AI_SETTINGS_SNAPSHOT_CAP_MAX_KB, Math.round(value))
  );
}

/** Deep-merge + clamp + enum sanitize. Safe for untrusted JSON. */
export function normalizeAiSettings(input: unknown): AiSettings {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const toolsRaw =
    raw.toolsEnabled && typeof raw.toolsEnabled === "object" && !Array.isArray(raw.toolsEnabled)
      ? (raw.toolsEnabled as Record<string, unknown>)
      : {};

  const toolsEnabled: AiSettings["toolsEnabled"] = {
    get_problems:
      typeof toolsRaw.get_problems === "boolean"
        ? toolsRaw.get_problems
        : DEFAULT_AI_SETTINGS.toolsEnabled.get_problems,
    git_status:
      typeof toolsRaw.git_status === "boolean"
        ? toolsRaw.git_status
        : DEFAULT_AI_SETTINGS.toolsEnabled.git_status,
    run_task:
      typeof toolsRaw.run_task === "boolean"
        ? toolsRaw.run_task
        : DEFAULT_AI_SETTINGS.toolsEnabled.run_task,
    open_preview:
      typeof toolsRaw.open_preview === "boolean"
        ? toolsRaw.open_preview
        : DEFAULT_AI_SETTINGS.toolsEnabled.open_preview,
  };

  return {
    toolsEnabled,
    redactionLevel: isAiRedactionLevel(raw.redactionLevel)
      ? raw.redactionLevel
      : DEFAULT_AI_SETTINGS.redactionLevel,
    messageCapKB: clampMessageCapKB(
      typeof raw.messageCapKB === "number" ? raw.messageCapKB : DEFAULT_AI_SETTINGS.messageCapKB
    ),
    snapshotCapKB: clampSnapshotCapKB(
      typeof raw.snapshotCapKB === "number" ? raw.snapshotCapKB : DEFAULT_AI_SETTINGS.snapshotCapKB
    ),
    timelineDetail: isAiTimelineDetail(raw.timelineDetail)
      ? raw.timelineDetail
      : DEFAULT_AI_SETTINGS.timelineDetail,
  };
}

export function mergeAiSettings(
  current: AiSettings,
  partial: Partial<AiSettings>
): AiSettings {
  return normalizeAiSettings({
    ...current,
    ...partial,
    toolsEnabled: {
      ...current.toolsEnabled,
      ...(partial.toolsEnabled ?? {}),
    },
  });
}
