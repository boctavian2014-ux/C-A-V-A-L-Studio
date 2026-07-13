export const FULL_DELIVERY_RULE = `
FULL DELIVERY — READY-TO-USE (obligatoriu în Agentic / Code Mode):
- Nu opri după o singură etapă sau primul set de fișiere.
- Livrează proiect RULABIL: structură, cod, teste, README cu pași de start, configs, .env.example, CI/CD când e relevant.
- UI: modern, dark, responsive — aplicat automat fără întrebare user când lipsesc specificații.
- Nu declara livrare finală până nu trec: Supervisor APPROVED, debug/fix issue-uri critice, teste + workspace verify.
- Reasoning/Plan fără fence-uri valide = delivery INCOMPLET — continuă compose până există fișiere \`\`\`lang:path\`\`\`.
- Nu repeta spec-ul userului în chat; emite fișiere noi sau completează cele lipsă.
- Sub-agents: fiecare task produce fence-uri cu cod complet, nu doar prose.
- AUTONOMIE: nu cere userului DELIVERY_CONTINUE, SCAFFOLD_CONTINUE sau AGENTIC_REPAIR — sistemul continuă automat până la gate OK sau limită de valuri.
- La verify fail: adaugă dependențele lipsă în package.json, fixează importuri/alias TS, re-emite fișiere complete — fără explicații lungi.
- La forbidden_path: NU re-crea src/zero-latency/ sau cavallo_task_generator/; șterge-le din plan și emite doar module reale.
- La TS2307 ../types: emite web/src/types.ts complet cu toate exporturile folosite de componente.
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
