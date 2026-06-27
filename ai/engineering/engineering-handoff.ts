import type { EngProject } from './engineering-generator';

export const CAVAL_OPEN_CODING_CHAT_EVENT = 'caval:open-coding-chat';

/** Serialize Engineering project for Coding Chat context attachment. */
export function formatEngineeringContextForCoding(
  project: EngProject,
  userPrompt: string
): string {
  const { spec, schema, parts, build } = project;

  const specBlock = [
    `# ${spec.title}`,
    '',
    spec.summary,
    '',
    `- Dimensiuni: ${spec.dimensions}`,
    `- Greutate: ${spec.weight}`,
    `- Materiale: ${spec.materials.join(', ')}`,
    `- Toleranțe: ${spec.tolerances}`,
  ].join('\n');

  const schemaBlock = [
    '## Schemă electronică',
    '',
    '### Noduri',
    ...schema.nodes.map(
      (n) => `- **${n.label}** (\`${n.id}\`, rol: ${n.role})`
    ),
    '',
    '### Conexiuni',
    ...schema.connections.map(
      (c) => `- ${c.from} → ${c.to}: ${c.label}`
    ),
    '',
    `- Buget putere: ${schema.powerBudget}`,
    `- Protocoale: ${schema.protocols.join(', ')}`,
  ].join('\n');

  const partsBlock = [
    '## BOM / Componente',
    '',
    '| Componentă | Qty | Preț | Magazin | Substitut |',
    '| --- | ---: | ---: | --- | --- |',
    ...parts.map(
      (p) =>
        `| ${p.name} | ${p.qty} | ${p.unitPrice} ${p.currency} | ${p.shop} | ${p.substitute ?? '—'} |`
    ),
  ].join('\n');

  const buildBlock = [
    '## Fișiere build (hardware)',
    '',
    ...build.map(
      (f) =>
        `### ${f.name} (${f.kind})\n${f.note}${f.content ? `\n\`\`\`\n${f.content}\n\`\`\`` : ''}`
    ),
  ].join('\n\n');

  return [
    '# Context Engineering AI — proiect hardware',
    '',
    'Folosește acest context pentru a genera software (app, dashboard, firmware complet, API) compatibil cu hardware-ul descris.',
    '',
    '## Cererea originală utilizator',
    userPrompt.trim() || '(fără descriere)',
    '',
    specBlock,
    '',
    schemaBlock,
    '',
    partsBlock,
    '',
    buildBlock,
  ].join('\n');
}

/** Default prompt pre-filled in Coding Chat after handoff. */
export function buildSoftwareHandoffPrompt(project: EngProject): string {
  const title = project.spec.title.trim() || 'proiectul hardware';
  return [
    `SCAFFOLD: creează proiectul software pentru „${title}” folosind contextul Engineering atașat.`,
    'Folosește write_file pentru fiecare fișier (app, API, firmware .ino dacă e cazul).',
    'Cod complet rulabil — zero arhitectură lungă.',
  ].join(' ');
}

export function dispatchOpenCodingChat(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CAVAL_OPEN_CODING_CHAT_EVENT));
  }
}
