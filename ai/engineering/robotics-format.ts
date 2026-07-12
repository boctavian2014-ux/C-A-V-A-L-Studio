import {
  ROBOTICS_AI_ULTRA_HEADINGS,
  ROBOTICS_AI_ULTRA_SYSTEM_PROMPT,
} from '../prompts/robotics-ai-ultra';
import type { BuildFile, EngProject, PartItem, SchemaNode } from './engineering-generator';

export type RoboticsSectionKey =
  | 'summary'
  | 'mechanical'
  | 'cad'
  | 'stl'
  | 'gcode'
  | 'partsList'
  | 'circuit'
  | 'pcbSchematic'
  | 'pcbNetlist'
  | 'assembly'
  | 'testing'
  | 'simulation'
  | 'collision'
  | 'cost'
  | 'animation'
  | 'documentation'
  | 'upgrades'
  | 'other';

export const ROBOTICS_SECTION_ORDER: RoboticsSectionKey[] = [
  'summary',
  'mechanical',
  'cad',
  'stl',
  'gcode',
  'partsList',
  'circuit',
  'pcbSchematic',
  'pcbNetlist',
  'assembly',
  'testing',
  'simulation',
  'collision',
  'cost',
  'animation',
  'documentation',
  'upgrades',
];

export const ROBOTICS_TAB_GROUPS: {
  id: string;
  label: string;
  sections: RoboticsSectionKey[];
}[] = [
  { id: 'overview', label: 'Overview', sections: ['summary', 'mechanical'] },
  { id: 'cad', label: 'CAD & Print', sections: ['cad', 'stl', 'gcode'] },
  { id: 'parts', label: 'Componente & Cost', sections: ['partsList', 'cost'] },
  { id: 'electronics', label: 'Electronics', sections: ['circuit', 'pcbSchematic', 'pcbNetlist'] },
  { id: 'build', label: 'Build & Test', sections: ['assembly', 'testing', 'simulation', 'collision'] },
  { id: 'docs', label: 'Docs & Upgrades', sections: ['animation', 'documentation', 'upgrades'] },
];

export interface PartsListRow {
  name: string;
  partNumber: string;
  quantity: string;
  role: string;
  notes: string;
  storeLink?: string;
}

export interface ParsedRoboticsPlan {
  rawMarkdown: string;
  sections: Record<RoboticsSectionKey, string>;
  partsListRows: PartsListRow[];
}

const SECTION_LABELS: Record<RoboticsSectionKey, string> = {
  summary: 'PROJECT SUMMARY',
  mechanical: 'MECHANICAL DESIGN',
  cad: 'CAD 3D MODEL',
  stl: 'STL EXPORT INSTRUCTIONS',
  gcode: 'G-CODE SETTINGS',
  partsList: 'COMPONENT LIST',
  circuit: 'ELECTRONICS & WIRING',
  pcbSchematic: 'PCB SCHEMATIC',
  pcbNetlist: 'PCB NETLIST',
  assembly: 'ASSEMBLY STEPS',
  testing: 'TESTING & CALIBRATION',
  simulation: 'SIMULATION & KINEMATICS',
  collision: 'COLLISION & INTERFERENCE CHECK',
  cost: 'COST OPTIMIZATION',
  animation: 'ANIMATION & MOTION SCRIPT',
  documentation: 'TECHNICAL DOCUMENTATION',
  upgrades: 'OPTIONAL UPGRADES',
  other: 'NOTES',
};

const SECTION_ALIASES: Record<RoboticsSectionKey, RegExp[]> = {
  summary: [/^#{1,3}\s*project summary/i, /^#{1,3}\s*rezumat/i, /^#{1,3}\s*requirements?\b/i, /^#{1,3}\s*sumar/i],
  mechanical: [/^#{1,3}\s*mechanical design/i, /^#{1,3}\s*design mecanic/i, /^#{1,3}\s*mecanic/i],
  cad: [/^#{1,3}\s*cad 3d model/i, /^#{1,3}\s*cad\b/i, /^#{1,3}\s*model 3d/i, /^#{1,3}\s*openscad/i],
  stl: [/^#{1,3}\s*stl export/i, /^#{1,3}\s*export stl/i, /^#{1,3}\s*stl\b/i],
  gcode: [/^#{1,3}\s*g-?code/i, /^#{1,3}\s*slicing/i, /^#{1,3}\s*print settings/i],
  partsList: [
    /^#{1,3}\s*component list/i,
    /^#{1,3}\s*lista de componente/i,
    /^#{1,3}\s*componente\b/i,
    /^#{1,3}\s*lista componente/i,
    /^#{1,3}\s*bom\b/i,
    /^#{1,3}\s*bill of materials/i,
    /^#{1,3}\s*piese\b/i,
  ],
  circuit: [/^#{1,3}\s*electronics?\s*&\s*wiring/i, /^#{1,3}\s*circuit\b/i, /^#{1,3}\s*electronic/i, /^#{1,3}\s*cablaj/i],
  pcbSchematic: [/^#{1,3}\s*pcb schematic/i, /^#{1,3}\s*schematic/i, /^#{1,3}\s*schema pcb/i],
  pcbNetlist: [/^#{1,3}\s*pcb netlist/i, /^#{1,3}\s*netlist/i],
  assembly: [/^#{1,3}\s*assembly/i, /^#{1,3}\s*asamblare/i, /^#{1,3}\s*montaj/i, /^#{1,3}\s*pasi de asamblare/i],
  testing: [/^#{1,3}\s*testing/i, /^#{1,3}\s*testare/i, /^#{1,3}\s*calibration/i],
  simulation: [/^#{1,3}\s*simulation/i, /^#{1,3}\s*kinematics/i, /^#{1,3}\s*simulare/i],
  collision: [/^#{1,3}\s*collision/i, /^#{1,3}\s*interference/i, /^#{1,3}\s*colizi/i],
  cost: [/^#{1,3}\s*cost optimization/i, /^#{1,3}\s*optimizare cost/i],
  animation: [/^#{1,3}\s*animation/i, /^#{1,3}\s*motion script/i, /^#{1,3}\s*anima/i],
  documentation: [/^#{1,3}\s*technical documentation/i, /^#{1,3}\s*documenta/i],
  upgrades: [/^#{1,3}\s*optional upgrades/i, /^#{1,3}\s*upgrades?\b/i, /^#{1,3}\s*upgrade/i],
  other: [],
};

export function roboticsSystemPrompt(): string {
  return ROBOTICS_AI_ULTRA_SYSTEM_PROMPT;
}

export function requiredRoboticsSections(): RoboticsSectionKey[] {
  return ['summary', 'cad', 'partsList', 'assembly'];
}

function emptySections(): Record<RoboticsSectionKey, string> {
  const out = {} as Record<RoboticsSectionKey, string>;
  for (const key of [...ROBOTICS_SECTION_ORDER, 'other'] as RoboticsSectionKey[]) {
    out[key] = '';
  }
  return out;
}

function normalizeHeadingLine(line: string): string {
  return line
    .trim()
    .replace(/^\d+[\.)]\s*/, '')
    .replace(/^\*\*\d+\.\*\*\s*/, '')
    .replace(/^[-*]\s+/, '');
}

function matchSectionKey(line: string): RoboticsSectionKey | null {
  const normalized = normalizeHeadingLine(line);
  for (const [key, patterns] of Object.entries(SECTION_ALIASES) as [RoboticsSectionKey, RegExp[]][]) {
    if (key === 'other') continue;
    if (patterns.some((re) => re.test(normalized))) return key;
  }
  for (const heading of ROBOTICS_AI_ULTRA_HEADINGS) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`^#{1,3}\\s*${escaped}\\b`, 'i').test(normalized)) {
      const entry = Object.entries(SECTION_LABELS).find(([, label]) => label === heading);
      if (entry) return entry[0] as RoboticsSectionKey;
    }
  }
  return null;
}

/** Prefer the richest markdown fragment when models split output across content vs reasoning. */
export function pickBestRoboticsMarkdown(content: string, reasoning: string): string {
  const candidates = [content.trim(), reasoning.trim(), `${content.trim()}\n${reasoning.trim()}`.trim()].filter(
    Boolean
  );

  const score = (text: string): number => {
    if (!text) return 0;
    let s = text.length;
    const headings = (text.match(/^#{1,3}\s/mg) ?? []).length;
    s += headings * 800;
    if (/##\s*project summary/i.test(text)) s += 2500;
    if (/##\s*cad/i.test(text)) s += 2500;
    if (/##\s*component list|##\s*lista de componente/i.test(text)) s += 2500;
    if (/##\s*assembly|##\s*asamblare/i.test(text)) s += 2000;
    if (text.includes('```openscad')) s += 3000;
    if (text.includes('| Name |') || text.includes('| Nume |')) s += 1500;
    // Penalize JSON-only responses
    if (/^\s*\{/.test(text) && !text.includes('## ')) s -= 5000;
    return s;
  };

  return [...candidates].sort((a, b) => score(b) - score(a))[0] ?? content.trim();
}

function applyRoboticsFallbacks(
  rawMarkdown: string,
  sections: Record<RoboticsSectionKey, string>,
  partsListRows: PartsListRow[]
): { sections: Record<RoboticsSectionKey, string>; partsListRows: PartsListRow[] } {
  const next = { ...sections };
  let rows = partsListRows;

  const scad = extractScadBlock(rawMarkdown);
  if (!next.cad?.trim() && scad) {
    next.cad = `\`\`\`openscad\n${scad}\n\`\`\``;
  }

  if (!next.partsList?.trim() || rows.length === 0) {
    const globalRows = extractPartsListRows(rawMarkdown);
    if (globalRows.length > 0) {
      rows = globalRows;
      if (!next.partsList?.trim()) {
        const tableStart = rawMarkdown.search(/^\|.*\|/m);
        if (tableStart >= 0) {
          next.partsList = rawMarkdown.slice(tableStart).split(/\n\n/)[0]?.trim() ?? '';
        }
      }
    }
  }

  if (!next.summary?.trim()) {
    const intro = rawMarkdown
      .split(/\r?\n/)
      .map(normalizeHeadingLine)
      .findIndex((line) => /^#{1,3}\s/.test(line));
    const introText = (intro > 0 ? rawMarkdown.split(/\r?\n/).slice(0, intro) : [])
      .join('\n')
      .trim();
    if (introText.length > 40) {
      next.summary = introText;
    } else if (next.other?.trim() && next.other.length > 80) {
      next.summary = next.other.slice(0, 600);
    }
  }

  if (!next.assembly?.trim()) {
    const assemblyMatch = rawMarkdown.match(
      /(?:^|\n)(?:\d+[\.)]\s*)?(?:montaj|asamblare|assembly)[:\s-]+([\s\S]{40,800})/i
    );
    if (assemblyMatch?.[1]) {
      next.assembly = assemblyMatch[1].trim();
    }
  }

  return { sections: next, partsListRows: rows };
}

export function parseRoboticsPlan(rawMarkdown: string): ParsedRoboticsPlan {
  const sections = emptySections();
  const lines = rawMarkdown.split(/\r?\n/);
  let current: RoboticsSectionKey = 'other';
  const buffers = Object.fromEntries(
    [...ROBOTICS_SECTION_ORDER, 'other'].map((k) => [k, [] as string[]])
  ) as Record<RoboticsSectionKey, string[]>;

  for (const line of lines) {
    const matched = matchSectionKey(line);
    if (matched) {
      current = matched;
      continue;
    }
    buffers[current].push(line);
  }

  for (const key of Object.keys(buffers) as RoboticsSectionKey[]) {
    sections[key] = buffers[key].join('\n').trim();
  }

  let partsListRows = extractPartsListRows(sections.partsList || rawMarkdown);
  const fallback = applyRoboticsFallbacks(rawMarkdown, sections, partsListRows);
  for (const key of Object.keys(fallback.sections) as RoboticsSectionKey[]) {
    sections[key] = fallback.sections[key];
  }
  partsListRows = fallback.partsListRows;

  return { rawMarkdown, sections, partsListRows };
}

export function extractPartsListRows(section: string): PartsListRow[] {
  const rows: PartsListRow[] = [];
  for (const line of section.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    if (/^\|\s*[-:]+\s*\|/.test(line)) continue;
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length < 4) continue;
    if (/name|nume|component|qty|cant|part/i.test(cells.join(' '))) continue;
    const storeLink = cells.find((c) => /^https?:\/\//i.test(c)) ?? cells[5];
    rows.push({
      name: cells[0] ?? '',
      partNumber: cells[1] ?? '',
      quantity: cells[2] ?? '',
      role: cells[3] ?? '',
      notes: cells[4] ?? '',
      storeLink: storeLink?.match(/https?:\/\/\S+/)?.[0],
    });
  }
  return rows;
}

export function partsListToCsv(rows: PartsListRow[]): string {
  const header = 'Name,Part/Code,Qty,Role,Notes';
  const body = rows.map((r) =>
    [r.name, r.partNumber, r.quantity, r.role, r.notes]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  );
  return [header, ...body].join('\n');
}

export function extractScadBlock(markdown: string): string | null {
  const match = markdown.match(/```(?:openscad|scad)\s*([\s\S]*?)```/i);
  if (!match) return null;
  const source = match[1].trim();
  return source || null;
}

export function extractNetlistBlock(markdown: string): string | null {
  const section = parseRoboticsPlan(markdown).sections.pcbNetlist;
  if (section.trim()) return section.trim();
  const fenced = markdown.match(/```(?:netlist|kicad|spice)\s*([\s\S]*?)```/i);
  return fenced?.[1]?.trim() || null;
}

export function missingRoboticsSections(plan: ParsedRoboticsPlan): RoboticsSectionKey[] {
  return requiredRoboticsSections().filter((key) => !plan.sections[key]?.trim());
}

export function roboticsPlanToMarkdown(plan: ParsedRoboticsPlan, title: string): string {
  const parts = [`# ${title}`, ''];
  for (const key of ROBOTICS_SECTION_ORDER) {
    const content = plan.sections[key];
    if (!content) continue;
    parts.push(`## ${SECTION_LABELS[key]}`, '', content, '');
  }
  if (plan.sections.other) {
    parts.push('## NOTES', '', plan.sections.other, '');
  }
  return parts.join('\n').trim();
}

export function tabGroupMarkdown(plan: ParsedRoboticsPlan, sectionKeys: RoboticsSectionKey[]): string {
  return sectionKeys
    .map((key) => {
      const body = plan.sections[key];
      if (!body) return '';
      return `## ${SECTION_LABELS[key]}\n\n${body}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

export function markdownToSimpleHtml(markdown: string): string {
  const escaped = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .split(/\r?\n/)
    .map((line) => {
      if (/^## /.test(line)) {
        return `<h2 style="font-size:13px;font-weight:700;margin:12px 0 6px;color:var(--caval-accent)">${line.slice(3)}</h2>`;
      }
      if (/^# /.test(line)) {
        return `<h1 style="font-size:15px;font-weight:700;margin:0 0 8px">${line.slice(2)}</h1>`;
      }
      if (/^### /.test(line)) {
        return `<h3 style="font-size:12px;font-weight:600;margin:8px 0 4px">${line.slice(4)}</h3>`;
      }
      if (/^[-*] /.test(line)) {
        return `<li style="margin-left:14px;font-size:12px;line-height:1.5">${line.slice(2)}</li>`;
      }
      if (line.trim() === '') return '<br/>';
      if (line.trim().startsWith('|')) {
        const cells = line
          .split('|')
          .filter((c) => c.trim())
          .map((c) => `<td style="padding:2px 6px;border:1px solid var(--caval-border)">${c.trim()}</td>`)
          .join('');
        return `<tr>${cells}</tr>`;
      }
      if (/^```/.test(line)) {
        return `<pre style="background:var(--caval-bg);padding:8px;border-radius:4px;font-size:11px;overflow-x:auto">${line}</pre>`;
      }
      return `<p style="font-size:12px;line-height:1.55;margin:4px 0;color:var(--caval-text)">${line}</p>`;
    })
    .join('\n');
}

function parseQty(raw: string): number {
  const n = parseInt(raw.replace(/\D/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parsePrice(notes: string): number {
  const m = notes.match(/(\d+[.,]\d{2})\s*(RON|lei|EUR|€)/i);
  if (!m) return 0;
  return parseFloat(m[1].replace(',', '.')) || 0;
}

function inferNodesFromCircuit(circuit: string): SchemaNode[] {
  const nodes: SchemaNode[] = [];
  const patterns: [RegExp, SchemaNode['role'], string][] = [
    [/\b(esp32|arduino|stm32|raspberry|pico|mcu|microcontroller)\b/i, 'mcu', 'MCU'],
    [/\b(sensor|senzor|imu|ultrasonic|lidar|bme|dht)\b/i, 'sensor', 'Sensor'],
    [/\b(battery|baterie|lipo|power supply|buck|regulator)\b/i, 'power', 'Power'],
    [/\b(motor|servo|driver|esc|actuator)\b/i, 'actuator', 'Actuator'],
  ];
  let i = 0;
  for (const [re, role, label] of patterns) {
    if (re.test(circuit)) {
      nodes.push({ id: `n${i++}`, label, role });
    }
  }
  if (!nodes.length) {
    nodes.push({ id: 'n0', label: 'MCU', role: 'mcu' });
  }
  return nodes;
}

export function roboticsPlanToEngProject(plan: ParsedRoboticsPlan): EngProject {
  const summary = plan.sections.summary;
  const titleMatch = summary.match(/^#\s+(.+)/m) || summary.match(/^(.{10,80})/m);
  const title = titleMatch?.[1]?.trim() || 'Proiect Robotics AI';

  const parts: PartItem[] = plan.partsListRows.map((row, i) => ({
    name: row.name || `Componentă ${i + 1}`,
    qty: parseQty(row.quantity),
    unitPrice: parsePrice(row.notes),
    currency: /EUR|€/i.test(row.notes) ? 'EUR' : 'RON',
    shop: row.storeLink ? safeHostname(row.storeLink) : '—',
    shopUrl: row.storeLink || '',
    substitute: undefined,
  }));

  const scad = extractScadBlock(plan.rawMarkdown);
  const build: BuildFile[] = [];
  if (scad) {
    build.push({
      name: 'model.scad',
      kind: 'stl',
      note: plan.sections.mechanical.slice(0, 200) || 'Model OpenSCAD parametric',
      content: scad.slice(0, 600),
    });
  }
  if (plan.sections.circuit) {
    build.push({
      name: 'wiring.txt',
      kind: 'wiring',
      note: 'Diagramă conexiuni',
      content: plan.sections.circuit.slice(0, 400),
    });
  }
  build.push({
    name: 'plan.md',
    kind: 'doc',
    note: 'Plan RoboticsAI ULTRA',
    content: roboticsPlanToMarkdown(plan, title).slice(0, 600),
  });

  const circuit = plan.sections.circuit;

  return {
    spec: {
      title,
      summary: summary.slice(0, 800),
      dimensions: plan.sections.mechanical.match(/\d+\s*mm/g)?.[0] || '—',
      weight: '—',
      materials: ['PLA/PETG'],
      tolerances: '0.2–0.5 mm clearance',
    },
    schema: {
      nodes: inferNodesFromCircuit(circuit),
      connections: [],
      powerBudget: '—',
      protocols: [],
    },
    parts: parts.length
      ? parts
      : [
          {
            name: 'ESP32 DevKit',
            qty: 1,
            unitPrice: 45,
            currency: 'RON',
            shop: 'Optimus Digital',
            shopUrl: 'https://www.optimusdigital.ro',
          },
        ],
    build,
  };
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '—';
  }
}
