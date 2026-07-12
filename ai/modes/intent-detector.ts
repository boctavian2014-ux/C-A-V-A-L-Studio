/**
 * CAVALLO intent detection — classifies user messages into direct chat modes.
 * Does NOT run for agentic mode (caller responsibility).
 */
import type { AgentModeId } from './agent-modes';

export type DirectChatModeId = 'plan' | 'code' | 'ask' | 'debug';

export interface IntentDetectionResult {
  mode: DirectChatModeId;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

const EXPLICIT_MODE_PATTERNS: Array<{ mode: DirectChatModeId; pattern: RegExp }> = [
  { mode: 'plan', pattern: /\b(?:PLAN\s+MODE|mod\s+plan)\b/i },
  { mode: 'code', pattern: /\b(?:CODE\s+MODE|mod\s+code)\b/i },
  { mode: 'ask', pattern: /\b(?:ASK\s+MODE|mod\s+ask)\b/i },
  { mode: 'debug', pattern: /\b(?:DEBUG\s+MODE|mod\s+debug)\b/i },
];

interface Signal {
  mode: DirectChatModeId;
  weight: number;
  label: string;
  pattern: RegExp;
}

const SIGNALS: Signal[] = [
  { mode: 'plan', weight: 3, label: 'plan keyword', pattern: /\b(?:plan|strategie|strateg(y|ia)|arhitectur[ăa]|roadmap|design\s+system|milestone|kpi)\b/i },
  { mode: 'code', weight: 3, label: 'code keyword', pattern: /\b(?:scrie\s+cod|genereaz[ăa]\s+cod|implementeaz[ăa]|implementare|programare|cod\s+pentru|build\s+this|write\s+code|generate\s+code|create\s+(?:the\s+)?(?:app|api|module|component))\b/i },
  { mode: 'ask', weight: 2, label: 'ask keyword', pattern: /\b(?:explic[ăa]|ce\s+înseamn[ăa]|cum\s+func(?:ț|t)ioneaz[ăa]|întrebare|what\s+is|how\s+does|explain|tell\s+me\s+about)\b/i },
  { mode: 'debug', weight: 3, label: 'debug keyword', pattern: /\b(?:debug|rezolv[ăa]\s+eroarea|analizeaz[ăa]\s+codul|de\s+ce\s+nu\s+merge|error|bug|stack\s+trace|fix\s+this|nu\s+merge)\b/i },
];

function scoreMessage(message: string): Map<DirectChatModeId, { score: number; reasons: string[] }> {
  const scores = new Map<DirectChatModeId, { score: number; reasons: string[] }>([
    ['plan', { score: 0, reasons: [] }],
    ['code', { score: 0, reasons: [] }],
    ['ask', { score: 0, reasons: [] }],
    ['debug', { score: 0, reasons: [] }],
  ]);

  for (const signal of SIGNALS) {
    if (signal.pattern.test(message)) {
      const entry = scores.get(signal.mode)!;
      entry.score += signal.weight;
      entry.reasons.push(signal.label);
    }
  }

  return scores;
}

/** Detect intent from user message. Defaults to ask when ambiguous. */
export function detectIntent(message: string, options?: { explicitTriggers?: boolean }): IntentDetectionResult {
  const text = message.trim();
  if (!text) {
    return { mode: 'ask', confidence: 'low', reason: 'empty message' };
  }

  if (options?.explicitTriggers !== false) {
    for (const { mode, pattern } of EXPLICIT_MODE_PATTERNS) {
      if (pattern.test(text)) {
        return { mode, confidence: 'high', reason: `explicit ${mode} trigger` };
      }
    }
  }

  const scores = scoreMessage(text);
  let best: DirectChatModeId = 'ask';
  let bestScore = 0;
  let bestReasons: string[] = [];

  for (const [mode, { score, reasons }] of scores) {
    if (score > bestScore) {
      bestScore = score;
      best = mode;
      bestReasons = reasons;
    }
  }

  if (bestScore === 0) {
    return { mode: 'ask', confidence: 'low', reason: 'no strong signals — default ask' };
  }

  const secondBest = [...scores.entries()]
    .filter(([m]) => m !== best)
    .sort((a, b) => b[1].score - a[1].score)[0];

  const margin = secondBest ? bestScore - secondBest[1].score : bestScore;
  const confidence: IntentDetectionResult['confidence'] =
    margin >= 2 || bestScore >= 4 ? 'high' : margin >= 1 ? 'medium' : 'low';

  return {
    mode: best,
    confidence,
    reason: bestReasons.join(', ') || best,
  };
}

/** Map legacy architect id to plan. */
export function normalizeAgentModeId(mode: string): AgentModeId {
  if (mode === 'architect') return 'plan';
  return mode as AgentModeId;
}

export function isDirectChatMode(mode: string): mode is DirectChatModeId {
  return mode === 'plan' || mode === 'code' || mode === 'ask' || mode === 'debug';
}
