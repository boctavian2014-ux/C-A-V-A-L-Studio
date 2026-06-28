export const FULL_DELIVERY_RULE = `
FULL DELIVERY (obligatoriu în Code Mode):
- Nu opri după o singură etapă sau primul set de fișiere.
- Livrează proiectul COMPLET: structură, cod, teste, README, configs, CI/CD când e relevant.
- Reasoning/Plan fără fence-uri valide = delivery INCOMPLET — continuă compose până există fișiere \`\`\`lang:path\`\`\`.
- Nu repeta spec-ul userului în chat; emite fișiere noi sau completează cele lipsă.
- Sub-agents: fiecare task produce fence-uri cu cod complet, nu doar prose.
`.trim();

export const DELIVERY_CONTINUE_MARKER = 'DELIVERY_CONTINUE';

export function buildDeliveryContinueMessage(planContext?: string, waveIndex = 1): string {
  const header = [
    DELIVERY_CONTINUE_MARKER,
    '',
    `Continuă delivery (val ${waveIndex + 1}). Completează TOATE fișierele lipsă din plan.`,
    'Emite fence-uri complete lang:path — fără plan fără fișiere.',
  ].join('\n');
  const ref = planContext?.trim().slice(0, 4_000);
  if (!ref) return header;
  return [header, '', '--- Plan / context anterior ---', ref].join('\n');
}

export function isDeliveryContinueRequest(message: string): boolean {
  return new RegExp(`\\b${DELIVERY_CONTINUE_MARKER}\\b`, 'i').test(message);
}
