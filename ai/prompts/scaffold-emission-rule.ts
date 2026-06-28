/**
 * Reguli obligatorii Cavalo Code Mode — materializare fișiere în workspace.
 */
import { SINGLE_PROJECT_FOCUS_RULE } from './single-project-focus';
import { FULL_DELIVERY_RULE } from './full-delivery-rule';

export const SCAFFOLD_CONTINUE_MARKER = 'SCAFFOLD_CONTINUE';

export const SCAFFOLD_EMISSION_RULE = `
${SINGLE_PROJECT_FOCUS_RULE}

${FULL_DELIVERY_RULE}

SCAFFOLD EMISSION (obligatoriu în Code Mode):
- După orice Reasoning/Plan, emite IMEDIAT fișiere ca \`\`\`lang:relative/path\`\`\` cu sursă COMPLETĂ.
- Reasoning fără fence-uri valide NU înlocuiește fișierele — planul e invalid până nu există \`\`\` blocks.
- Un fișier = un fence; header obligatoriu cu path relativ la workspace (ex. \`\`\`typescript:src/main/foo.ts\`\`\`).
- Interzis: „voi crea…”, liste lungi fără cod, snippet-uri fără path, path absolut Windows.
- Chat: max câteva linii status/recap DUPĂ fence-uri — nu dump de sursă în prose.
- parseScaffoldFiles + applyScaffoldToWorkspace scriu automat în proiectul deschis.
`.trim();

export const SCAFFOLD_CONTINUE_USER_MESSAGE = [
  SCAFFOLD_CONTINUE_MARKER,
  '',
  'Continuă implementarea din planul anterior. Nu repeta explicațiile.',
  '',
  'Emite TOATE fișierele ca blocuri complete cu header lang:path și cod complet.',
  'Un fișier = un fence; path relativ; fără plan fără fișiere.',
].join('\n');

/** Mesaj utilizator pentru continuare manuală după plan fără fence-uri. */
export function buildScaffoldContinueUserMessage(planContext?: string): string {
  const ref = planContext?.trim().slice(0, 3_000);
  if (!ref) return SCAFFOLD_CONTINUE_USER_MESSAGE;
  return [SCAFFOLD_CONTINUE_USER_MESSAGE, '', '--- Plan anterior (referință) ---', ref].join('\n');
}

export function isScaffoldContinueRequest(message: string): boolean {
  return new RegExp(`\\b${SCAFFOLD_CONTINUE_MARKER}\\b`, 'i').test(message);
}
