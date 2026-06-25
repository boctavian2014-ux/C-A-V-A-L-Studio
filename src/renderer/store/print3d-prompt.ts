export interface Print3DChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type Print3DPlannerAction = 'clarify' | 'generate';
export type Print3DUserLanguage = 'ro' | 'en';
export type Print3DPipeline = 'openscad' | 'mesh';

export interface Print3DPlannerResult {
  action: Print3DPlannerAction;
  userLanguage: Print3DUserLanguage;
  intent: 'mechanical' | 'organic' | 'figurine' | 'mixed';
  pipeline: Print3DPipeline;
  questions?: string[];
  assistantMessage?: string;
  technicalPrompt: string;
  suggestedDimensions?: string;
  warnings?: string[];
  quickReplies?: string[];
}

export function buildClarifyMessage(plan: Print3DPlannerResult): string {
  const parts: string[] = [];
  if (plan.assistantMessage) parts.push(plan.assistantMessage);
  if (plan.questions?.length) {
    parts.push(plan.questions.map((q, i) => `${i + 1}. ${q}`).join('\n'));
  }
  if (plan.warnings?.length) {
    parts.push(plan.warnings.join('\n'));
  }
  return (
    parts.join('\n\n') ||
    (plan.userLanguage === 'ro' ? 'Am nevoie de câteva detalii.' : 'I need a few details.')
  );
}

const MAX_HISTORY = 10;
/** Build the CAD prompt from chat history and the latest user message. */
export function composePrint3DPrompt(
  messages: Print3DChatMessage[],
  latestUserText: string
): string {
  const trimmed = latestUserText.trim();
  const prior = messages.filter((m) => m.content.trim());
  const contextLines = prior
    .slice(-MAX_HISTORY)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`);

  return [
    '=== Print 3D request (follow the latest user message exactly) ===',
    trimmed,
    contextLines.length > 0 ? `\nConversation:\n${contextLines.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Conversation history for the CAD API (excludes in-flight assistant placeholders). */
export function buildConversationHistory(
  messages: Print3DChatMessage[]
): Print3DChatMessage[] {
  const skipPrefixes = ['Generez', 'Generating', 'Analizez', 'Analyzing'];
  return messages
    .filter(
      (m) =>
        m.content.trim() &&
        !skipPrefixes.some((p) => m.content.trim().startsWith(p))
    )    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.trim() }));
}

export function findPreviousScad(
  messages: Array<{ scad?: string | null }>
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const scad = messages[i]?.scad?.trim();
    if (scad) return scad;
  }
  return undefined;
}
