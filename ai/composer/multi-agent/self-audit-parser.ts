export interface SelfAuditScores {
  reasoning?: number;
  coding?: number;
  planning?: number;
  toolUse?: number;
  failureModes?: string[];
}

export interface ParsedSelfAudit {
  taskSuccess?: 'pass' | 'fail';
  toolUseAccuracy?: number;
  trajectoryEfficiency?: number;
  topFailureMode?: string;
  scores?: SelfAuditScores;
  improveRule?: string;
  prose?: string;
}

const SELF_AUDIT_HEADER = /##\s*Self-Audit\b/i;

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function parseLineValue(text: string, key: string): string | undefined {
  const re = new RegExp(`^-\\s*${key}\\s*:\\s*(.+)$`, 'im');
  const m = text.match(re);
  return m?.[1]?.trim();
}

function parseJsonBlock(text: string): SelfAuditScores | undefined {
  const fence = text.match(/```(?:json)?\s*\n([\s\S]*?)```/i);
  const raw = fence?.[1]?.trim();
  if (!raw || !raw.startsWith('{')) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const failureModes = Array.isArray(parsed.failureModes)
      ? parsed.failureModes.filter((x): x is string => typeof x === 'string').slice(0, 5)
      : undefined;
    return {
      reasoning: typeof parsed.reasoning === 'number' ? clampScore(parsed.reasoning) : undefined,
      coding: typeof parsed.coding === 'number' ? clampScore(parsed.coding) : undefined,
      planning: typeof parsed.planning === 'number' ? clampScore(parsed.planning) : undefined,
      toolUse: typeof parsed.toolUse === 'number' ? clampScore(parsed.toolUse) : undefined,
      failureModes,
    };
  } catch {
    return undefined;
  }
}

/** Extract Self-Audit section and optional JSON scores from agent output. */
export function parseSelfAuditOutput(text: string): ParsedSelfAudit | null {
  if (!text?.trim()) return null;
  const headerIdx = text.search(SELF_AUDIT_HEADER);
  if (headerIdx < 0) return null;

  const section = text.slice(headerIdx);
  const taskSuccessRaw = parseLineValue(section, 'TaskSuccess');
  const toolRaw = parseLineValue(section, 'ToolUseAccuracy');
  const trajRaw = parseLineValue(section, 'TrajectoryEfficiency');
  const topFailureMode = parseLineValue(section, 'TopFailureMode');

  let taskSuccess: 'pass' | 'fail' | undefined;
  if (taskSuccessRaw) {
    const lower = taskSuccessRaw.toLowerCase();
    if (lower.startsWith('pass')) taskSuccess = 'pass';
    else if (lower.startsWith('fail')) taskSuccess = 'fail';
  }

  const toolUseAccuracy = toolRaw ? clampScore(Number.parseFloat(toolRaw)) : undefined;
  const trajectoryEfficiency = trajRaw ? clampScore(Number.parseFloat(trajRaw)) : undefined;

  const ruleMatch = section.match(/rule will you adopt next time\?\s*\n(.+)/i);
  const improveRule = ruleMatch?.[1]?.trim().slice(0, 300);

  return {
    taskSuccess,
    toolUseAccuracy,
    trajectoryEfficiency,
    topFailureMode,
    scores: parseJsonBlock(section),
    improveRule,
    prose: section.slice(0, 600),
  };
}

/** Short badge for timeline UI, e.g. "TS:94% · TU:78%". */
export function formatSelfAuditBadge(audit: ParsedSelfAudit | null, taskOk?: boolean): string | undefined {
  if (!audit && taskOk == null) return undefined;
  const parts: string[] = [];
  if (audit?.taskSuccess) {
    parts.push(`TS:${audit.taskSuccess === 'pass' ? '✓' : '✗'}`);
  } else if (taskOk != null) {
    parts.push(`TS:${taskOk ? '✓' : '✗'}`);
  }
  const tu = audit?.toolUseAccuracy ?? audit?.scores?.toolUse;
  if (tu != null) parts.push(`TU:${tu}%`);
  const tr = audit?.trajectoryEfficiency;
  if (tr != null) parts.push(`TR:${tr}%`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}
