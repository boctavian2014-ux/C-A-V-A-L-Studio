const CODE_FENCE = /```[\s\S]*?```/g;
const TOOL_NOTICE = /🔧\s*\*[^*]+\*…?/g;
const ARENA_NOISE = /⚠\s*\w+:.+\n?/g;
const HORSE_RACE_LLM = /🏁\s*CAVALLO HORSE RACE[\s\S]*?(?=\n\n|$)/gi;

/** Remove tool markers and arena noise from streamed chat text. */
export function stripArenaChatNoise(raw: string): string {
  return raw
    .replace(HORSE_RACE_LLM, '')
    .replace(TOOL_NOTICE, '')
    .replace(ARENA_NOISE, '')
    .trim();
}

export interface ChatDisplaySummary {
  lines: string[];
  codeBlockCount: number;
  truncated: boolean;
}

const MAX_CHAT_LINES = 4;

/** Strip code fences; keep at most 4 lines for the chat panel (code → editor). */
export function summarizeForChatPanel(raw: string, maxLines = MAX_CHAT_LINES): ChatDisplaySummary {
  const withoutCode = raw
    .replace(CODE_FENCE, '')
    .replace(TOOL_NOTICE, '')
    .replace(/^#+\s/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();

  const codeBlockCount = (raw.match(/```/g)?.length ?? 0) / 2;

  const paragraphs = withoutCode
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const lines = paragraphs.slice(0, maxLines);
  return {
    lines,
    codeBlockCount: Math.floor(codeBlockCount),
    truncated: paragraphs.length > maxLines || codeBlockCount > 0,
  };
}

export function formatChatPanelSummary(summary: ChatDisplaySummary, isStreaming?: boolean): string {
  if (summary.lines.length === 0 && summary.codeBlockCount > 0) {
    return isStreaming
      ? '⚡ Scriu cod în editor…'
      : `✓ Cod generat (${summary.codeBlockCount} bloc(uri)) — vezi editorul central.`;
  }
  const text = summary.lines.join('\n');
  if (summary.truncated && !isStreaming) {
    return `${text}\n→ Cod complet în editor.`;
  }
  return text || (isStreaming ? '⚡ Lucrez…' : '');
}

export interface ArenaReasoningInput {
  goal: string;
  approach: string;
  modules?: string[];
}

/** Structured Arena chat: early brief, compose status, or final recap (max ~6 lines). */
export function formatArenaReasoning(
  brief?: ArenaReasoningInput,
  recap?: string,
  isStreaming?: boolean,
  composePhase?: boolean
): string {
  if (recap) {
    return recap.split('\n').filter(Boolean).slice(0, 6).join('\n');
  }
  if (composePhase && isStreaming) {
    return 'Compose · scriu în editor…';
  }
  if (brief?.goal) {
    const lines = [`Goal: ${brief.goal}`, `Plan: ${brief.approach}`];
    if (brief.modules?.length) {
      lines.push(`Modules: ${brief.modules.slice(0, 3).join(', ')}`);
    }
    return lines.slice(0, 4).join('\n');
  }
  return isStreaming ? 'Full Integration pipeline…' : '';
}
