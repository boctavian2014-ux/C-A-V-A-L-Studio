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
    '## Lista de componente',
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
    '# Context Robotics AI — proiect hardware',
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

function inferSoftwareNeeds(project: EngProject, userPrompt: string): string[] {
  const blob = [
    userPrompt,
    project.spec.title,
    project.spec.summary,
    project.schema.nodes.map((n) => `${n.label} ${n.role}`).join(' '),
    project.schema.protocols.join(' '),
    project.parts.map((p) => p.name).join(' '),
    project.build.map((b) => `${b.name} ${b.kind} ${b.note}`).join(' '),
  ]
    .join(' ')
    .toLowerCase();

  const needs: string[] = [];
  if (/esp32|arduino|firmware|\.ino|mcu|stm32|pico/i.test(blob)) {
    needs.push('firmware (Arduino/ESP-IDF/.ino/.cpp) cu setup/loop, I2C/SPI/UART după schemă');
  }
  if (/wifi|http|api|rest|mqtt|websocket|dashboard|web|app|ui|react|next/i.test(blob)) {
    needs.push('aplicație web/dashboard (UI + API) pentru telemetrie și control');
  }
  if (/bluetooth|ble/i.test(blob)) {
    needs.push('client BLE / pairing și comenzi wireless');
  }
  if (/senzor|sensor|oled|bme|imu|gps/i.test(blob)) {
    needs.push('citire senzori + afișare/logging date');
  }
  if (needs.length === 0) {
    needs.push('software minimal care leagă hardware-ul de o interfață utilă (firmware și/sau app)');
  }
  return needs;
}

/** Default prompt auto-sent in Coding Chat after robotics handoff. */
export function buildSoftwareHandoffPrompt(
  project: EngProject,
  userPrompt = ''
): string {
  const title = project.spec.title.trim() || 'proiectul hardware';
  const needs = inferSoftwareNeeds(project, userPrompt);
  const protocols = project.schema.protocols.filter(Boolean).join(', ') || 'după schemă';
  const mcu =
    project.schema.nodes.find((n) => /mcu|esp|arduino/i.test(`${n.role} ${n.label}`))?.label ??
    'MCU din schemă';

  return [
    `Generează ACUM software-ul necesar pentru proiectul hardware „${title}”, folosind contextul Robotics AI atașat (hardware, BOM, conexiuni, build).`,
    userPrompt.trim() ? `Cererea utilizatorului: ${userPrompt.trim().slice(0, 400)}` : '',
    `Rezumat hardware: ${project.spec.summary.slice(0, 280)}`,
    `MCU / nod principal: ${mcu}. Protocoale: ${protocols}.`,
    `Nevoi software de acoperit:\n${needs.map((n) => `- ${n}`).join('\n')}`,
    'Emite IMEDIAT fișiere complete în workspace ca ```typescript:src/...```, ```cpp:firmware/...``` sau ```ino:firmware/...``` — fiecare fișier = un bloc cu path relativ.',
    'Cod rulabil, structurat pe module; fără plan lung fără fișiere. Respectă pinii/conexiunile din context.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function dispatchOpenCodingChat(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CAVAL_OPEN_CODING_CHAT_EVENT));
  }
}
