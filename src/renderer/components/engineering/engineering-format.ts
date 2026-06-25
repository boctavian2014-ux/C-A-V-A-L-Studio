export type EngineeringProjectType = 'drone' | 'robot' | 'iot' | 'cnc' | 'custom';

export type EngineeringSectionKey =
  | 'requirements'
  | 'bom'
  | 'circuit'
  | 'pcb'
  | 'assembly'
  | 'testing'
  | 'performance'
  | 'upgrades'
  | 'other';

export const SECTION_ORDER: EngineeringSectionKey[] = [
  'requirements',
  'bom',
  'circuit',
  'pcb',
  'assembly',
  'testing',
  'performance',
  'upgrades',
];

export interface EngineeringConstraints {
  budget: string;
  dimensions: string;
  voltage: string;
  autonomy: string;
  weight: string;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
}

export interface BomRow {
  name: string;
  partNumber: string;
  quantity: string;
  role: string;
  notes: string;
}

export interface ParsedEngineeringPlan {
  rawMarkdown: string;
  sections: Record<EngineeringSectionKey, string>;
  bomRows: BomRow[];
}

const SECTION_ALIASES: Record<EngineeringSectionKey, RegExp[]> = {
  requirements: [/^#{1,3}\s*requirements?\b/i, /^#{1,3}\s*cerin[tț]e/i, /^#{1,3}\s*specifica[tț]ii/i],
  bom: [/^#{1,3}\s*bom\b/i, /^#{1,3}\s*bill of materials/i, /^#{1,3}\s*componente/i, /^#{1,3}\s*lista de componente/i],
  circuit: [/^#{1,3}\s*circuit\b/i, /^#{1,3}\s*schema\b/i, /^#{1,3}\s*schem[aă]/i, /^#{1,3}\s*conexiuni/i, /^#{1,3}\s*circuit design/i],
  pcb: [/^#{1,3}\s*pcb\b/i, /^#{1,3}\s*layout\b/i, /^#{1,3}\s*topologie/i, /^#{1,3}\s*wiring layout/i],
  assembly: [/^#{1,3}\s*assembly\b/i, /^#{1,3}\s*asamblare/i, /^#{1,3}\s*montaj/i],
  testing: [/^#{1,3}\s*testing\b/i, /^#{1,3}\s*testare/i, /^#{1,3}\s*validation/i, /^#{1,3}\s*debug/i],
  performance: [/^#{1,3}\s*performance\b/i, /^#{1,3}\s*estimation\b/i, /^#{1,3}\s*performan[tț]/i],
  upgrades: [/^#{1,3}\s*upgrades?\b/i, /^#{1,3}\s*optional upgrades/i, /^#{1,3}\s*upgrade/i],
  other: [],
};

const SECTION_LABELS: Record<EngineeringSectionKey, string> = {
  requirements: 'REQUIREMENTS',
  bom: 'BOM',
  circuit: 'CIRCUIT',
  pcb: 'PCB',
  assembly: 'ASSEMBLY',
  testing: 'TESTING',
  performance: 'PERFORMANCE',
  upgrades: 'UPGRADES',
  other: 'NOTES',
};

const PROJECT_TYPE_LABELS: Record<EngineeringProjectType, string> = {
  drone: 'Dronă FPV',
  robot: 'Robot mobil',
  iot: 'Nod IoT',
  cnc: 'Controller CNC',
  custom: 'Proiect hardware custom',
};

const DEFAULT_BUILDS: Record<EngineeringProjectType, string> = {
  drone: '5" FPV racing/freestyle quad, 4S, 2207 motors, ELRS, analog or HD-ready stack',
  robot: 'differential-drive mobile robot, STM32/RPi brain, motor drivers, IMU, LiDAR-ready',
  iot: 'battery-powered environmental sensor node with WiFi and deep-sleep',
  cnc: '3-axis GRBL controller with stepper drivers, limit switches, spindle relay',
  custom: 'well-scoped reference build matching the user domain',
};

export function projectTypeLabel(type: EngineeringProjectType): string {
  return PROJECT_TYPE_LABELS[type];
}

function emptySections(): Record<EngineeringSectionKey, string> {
  return {
    requirements: '',
    bom: '',
    circuit: '',
    pcb: '',
    assembly: '',
    testing: '',
    performance: '',
    upgrades: '',
    other: '',
  };
}

function buildMasterPromptRules(): string {
  return [
    'RULES:',
    '- ALWAYS output in the exact 8-section structure below.',
    '- ALWAYS explain WHY each component is chosen.',
    '- NEVER say "it depends"; choose sensible defaults.',
    '- NEVER leave sections empty.',
    '- ALWAYS optimize for reliability + performance.',
    '- ALWAYS assume the user wants best engineering practices.',
    '- If user asks for a specific part → integrate it into the design.',
    '- If user gives no details → generate a full standard reference build for this project type.',
    '- For each major BOM item: include 1 recommended, 1 cheaper, 1 high-performance alternative.',
    '- Warn about battery polarity, high current, mains voltage, and ESD where relevant.',
    '- Use metric units unless user specifies otherwise.',
    '- Respond in Romanian if the user prompt is in Romanian.',
    '',
    'OUTPUT FORMAT — use exactly these markdown headings:',
    '## REQUIREMENTS',
    '## BOM',
    '## CIRCUIT',
    '## PCB',
    '## ASSEMBLY',
    '## TESTING',
    '## PERFORMANCE',
    '## UPGRADES',
  ].join('\n');
}

function buildDroneInstructions(): string {
  return [
    '1) REQUIREMENTS — extract and define:',
    '- drone type (racing / freestyle / cinematic)',
    '- frame size (inches)',
    '- battery type (4S / 6S)',
    '- skill level required',
    '- constraints (budget, weight, durability, noise, flight time)',
    '- performance targets (thrust, AUW, amp draw, flight time)',
    'If incomplete → infer reasonable defaults. Default reference: standard 5" FPV build.',
    '',
    '2) BOM — complete list:',
    'Frame, Motors (size, KV, thrust class), ESC (amps, BLHeli_S/32), Flight Controller (F4/F7, gyro),',
    'FPV camera, VTX (power, SmartAudio/Tramp), Antenna (RHCP/LHCP), Receiver (ELRS/Crossfire/FrSky),',
    'Battery (capacity, C-rating), Capacitor (low-ESR), cables, connectors, screws, pads, accessories.',
    'BOM table columns: Name | Part/Code | Qty | Role | Notes',
    '',
    '3) CIRCUIT — describe ALL connections:',
    'Power (battery → XT60 → ESC → FC), Motor block, FPV (camera → VTX → antenna),',
    'Control (FC UARTs → receiver, VTX), Safety (buzzer, LED), Filtering (capacitor placement).',
    'Include pin-to-pin mapping, voltage levels, UART assignments, polarity/noise warnings.',
    '',
    '4) PCB / WIRING — cable routing, noise isolation, ESC/FC stack mounting, antenna placement,',
    'video noise mitigation, motor wire length, XT60 strain relief. If custom PCB: topology, power planes, trace widths.',
    '',
    '5) ASSEMBLY — numbered steps: frame, ESC, motors, FC, FPV, receiver, antenna, cable mgmt, final tightening.',
    'Each step: tools, risks, checks before moving on.',
    '',
    '6) TESTING — continuity, smoke stopper, Betaflight checklist, motor direction, failsafe, OSD, maiden flight.',
    '',
    '7) PERFORMANCE — thrust-to-weight, amp draw, flight time (hover + aggressive), thermal limits, ESC headroom, battery stress.',
    '',
    '8) UPGRADES — better motors, VTX, antenna, GPS, HD system (DJI/HDZero), tuning improvements.',
  ].join('\n');
}

function buildRobotInstructions(): string {
  return [
    '1) REQUIREMENTS — robot type, drive (differential/mecanum/ackermann), payload, runtime, environment, skill level.',
    'Default reference: differential-drive mobile robot with MCU brain.',
    '',
    '2) BOM — chassis, MCU/SBC, motor drivers, motors+encoders, IMU, power (BMS/buck), sensors (ultrasonic/LiDAR-ready),',
    'connectors, wiring, mounting hardware. Table: Name | Part/Code | Qty | Role | Notes',
    '',
    '3) CIRCUIT — power block, motor driver block, sensor block (I2C/SPI/UART), communication (USB/WiFi), E-stop/buzzer.',
    'Pin-to-pin, voltage levels, bus assignments.',
    '',
    '4) PCB / WIRING — motor cable routing, encoder lines, IMU isolation, grounding, strain relief, stack mounting.',
    '',
    '5) ASSEMBLY — chassis, drivetrain, electronics stack, sensor mounting, cable management, final checks.',
    '',
    '6) TESTING — continuity, power-on, motor direction, encoder feedback, IMU calibration, comms, bench drive test.',
    '',
    '7) PERFORMANCE — payload capacity, max speed, runtime, thermal headroom, motor/driver margin.',
    '',
    '8) UPGRADES — closed-loop drivers, LiDAR, better MCU, encoders, ROS-ready compute, battery upgrade.',
  ].join('\n');
}

function buildIotInstructions(): string {
  return [
    '1) REQUIREMENTS — sensor types, connectivity (WiFi/BLE/LoRa), power source, enclosure IP, deployment environment, battery life target.',
    'Default reference: battery-powered WiFi sensor node with deep sleep.',
    '',
    '2) BOM — MCU/SoC, sensors, radio module, power (battery/solar/USB), regulators, protection (TVS/fuse), antenna, enclosure, connectors.',
    'Table: Name | Part/Code | Qty | Role | Notes',
    '',
    '3) CIRCUIT — power path, sensor buses, radio UART/SPI, programming header, reset/boot, ESD protection.',
    '',
    '4) PCB / WIRING — RF keep-out, antenna placement, battery compartment, conformal coating notes, enclosure gland routing.',
    '',
    '5) ASSEMBLY — board prep, sensor solder, radio/antenna, power wiring, enclosure assembly, sealing.',
    '',
    '6) TESTING — continuity, current draw (active/sleep), sensor readout, provisioning, OTA, field range test.',
    '',
    '7) PERFORMANCE — power budget mA, battery life estimate, RF range, sampling rate limits.',
    '',
    '8) UPGRADES — better radio, solar panel, IP-rated enclosure, edge ML module, external antenna.',
  ].join('\n');
}

function buildCncInstructions(): string {
  return [
    '1) REQUIREMENTS — axes count, work area, spindle type, control software (GRBL/Mach/LinuxCNC), safety needs.',
    'Default reference: 3-axis GRBL controller with stepper drivers and limit switches.',
    '',
    '2) BOM — controller board, stepper drivers, PSU, stepper motors, limit switches, spindle relay/VFD interface,',
    'e-stop, connectors, shielded cables, grounding hardware. Table: Name | Part/Code | Qty | Role | Notes',
    '',
    '3) CIRCUIT — PSU → drivers → steppers, limit switch inputs, spindle control, e-stop chain, grounding/shielding.',
    '',
    '4) PCB / WIRING — motor cable separation from signal, limit switch routing, VFD wiring warnings, cabinet layout.',
    '',
    '5) ASSEMBLY — controller mount, driver wiring, limit switches, spindle interface, e-stop, cable dress, grounding.',
    '',
    '6) TESTING — continuity, homing sequence, soft limits, spindle interlock, step calibration, test cut protocol.',
    '',
    '7) PERFORMANCE — cutting force estimate, thermal headroom on drivers, max feed rate, PSU margin.',
    '',
    '8) UPGRADES — closed-loop drivers, probe, better spindle/VFD, dust collection interlock, limit switch upgrade.',
  ].join('\n');
}

function buildCustomInstructions(): string {
  return [
    '1) REQUIREMENTS — interpret user intent, define functional blocks, constraints, skill level, performance targets.',
    '',
    '2) BOM — all major components with recommended/cheaper/high-performance alternatives. Table: Name | Part/Code | Qty | Role | Notes',
    '',
    '3) CIRCUIT — power, control, sensors, actuators; pin-to-pin, voltage levels, bus assignments, safety warnings.',
    '',
    '4) PCB / WIRING — layout guidelines, noise isolation, connector placement, tool recommendation (KiCad/EasyEDA).',
    '',
    '5) ASSEMBLY — numbered steps with tools, risks, and verification checks.',
    '',
    '6) TESTING — bring-up procedure, configuration checklist, failure modes and fixes.',
    '',
    '7) PERFORMANCE — key metrics, margins, thermal/power estimates for this design.',
    '',
    '8) UPGRADES — sensible next-step improvements.',
  ].join('\n');
}

function buildTypeSpecificInstructions(projectType: EngineeringProjectType): string {
  const builders: Record<EngineeringProjectType, () => string> = {
    drone: buildDroneInstructions,
    robot: buildRobotInstructions,
    iot: buildIotInstructions,
    cnc: buildCncInstructions,
    custom: buildCustomInstructions,
  };
  return [
    `PROJECT TYPE: ${PROJECT_TYPE_LABELS[projectType]}`,
    `DEFAULT REFERENCE BUILD: ${DEFAULT_BUILDS[projectType]}`,
    '',
    builders[projectType](),
  ].join('\n');
}

export function buildEngineeringPrompt(input: {
  prompt: string;
  projectType: EngineeringProjectType;
  constraints: EngineeringConstraints;
}): string {
  const { prompt, projectType, constraints } = input;
  const constraintLines = [
    constraints.budget && `Budget: ${constraints.budget}`,
    constraints.dimensions && `Dimensions / size limits: ${constraints.dimensions}`,
    constraints.voltage && `Voltage / power: ${constraints.voltage}`,
    constraints.autonomy && `Autonomy / runtime: ${constraints.autonomy}`,
    constraints.weight && `Weight target: ${constraints.weight}`,
    `Skill level: ${constraints.skillLevel}`,
  ].filter(Boolean);

  return [
    'You are Engineering AI, a hardware design assistant integrated in Caval Studio.',
    '',
    buildMasterPromptRules(),
    '',
    buildTypeSpecificInstructions(projectType),
    '',
    constraintLines.length ? `USER CONSTRAINTS:\n${constraintLines.map((l) => `- ${l}`).join('\n')}` : '',
    '',
    'USER PROJECT IDEA:',
    prompt.trim() || DEFAULT_BUILDS[projectType],
  ].join('\n');
}

function matchSectionKey(line: string): EngineeringSectionKey | null {
  for (const [key, patterns] of Object.entries(SECTION_ALIASES) as [EngineeringSectionKey, RegExp[]][]) {
    if (key === 'other') continue;
    if (patterns.some((re) => re.test(line.trim()))) return key;
  }
  return null;
}

export function parseEngineeringPlan(rawMarkdown: string): ParsedEngineeringPlan {
  const sections = emptySections();
  const lines = rawMarkdown.split(/\r?\n/);
  let current: EngineeringSectionKey = 'other';
  const buffers: Record<EngineeringSectionKey, string[]> = {
    requirements: [],
    bom: [],
    circuit: [],
    pcb: [],
    assembly: [],
    testing: [],
    performance: [],
    upgrades: [],
    other: [],
  };

  for (const line of lines) {
    const matched = matchSectionKey(line);
    if (matched) {
      current = matched;
      continue;
    }
    buffers[current].push(line);
  }

  for (const key of Object.keys(buffers) as EngineeringSectionKey[]) {
    sections[key] = buffers[key].join('\n').trim();
  }

  return {
    rawMarkdown,
    sections,
    bomRows: extractBomRows(sections.bom || rawMarkdown),
  };
}

export function extractBomRows(bomSection: string): BomRow[] {
  const rows: BomRow[] = [];
  const lines = bomSection.split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim().startsWith('|')) continue;
    if (/^\|\s*[-:]+\s*\|/.test(line)) continue;
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length < 4) continue;
    const headerLike = /name|nume|component|qty|cant/i.test(cells.join(' '));
    if (headerLike) continue;

    rows.push({
      name: cells[0] ?? '',
      partNumber: cells[1] ?? '',
      quantity: cells[2] ?? '',
      role: cells[3] ?? '',
      notes: cells[4] ?? '',
    });
  }

  return rows;
}

export function bomToCsv(rows: BomRow[]): string {
  const header = 'Name,Part/Code,Qty,Role,Notes';
  const body = rows.map((r) =>
    [r.name, r.partNumber, r.quantity, r.role, r.notes]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  );
  return [header, ...body].join('\n');
}

export function circuitToStructuredJson(sections: ParsedEngineeringPlan['sections']): string {
  const payload = {
    format: 'caval-engineering-circuit-v2',
    generatedAt: new Date().toISOString(),
    requirements: sections.requirements,
    circuit: sections.circuit,
    pcb: sections.pcb,
    performance: sections.performance,
    upgrades: sections.upgrades,
    notes: 'Logical circuit description for import/reference in KiCad or EasyEDA workflows.',
  };
  return JSON.stringify(payload, null, 2);
}

export function planToMarkdown(parsed: ParsedEngineeringPlan, title: string): string {
  const parts = [`# ${title}`, ''];

  for (const key of SECTION_ORDER) {
    const content = parsed.sections[key];
    if (!content) continue;
    parts.push(`## ${SECTION_LABELS[key]}`, '', content, '');
  }

  if (parsed.sections.other) {
    parts.push('## NOTES', '', parsed.sections.other, '');
  }

  return parts.join('\n').trim();
}

export function markdownToSimpleHtml(markdown: string): string {
  const escaped = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .split(/\r?\n/)
    .map((line) => {
      if (/^## /.test(line)) return `<h2>${line.slice(3)}</h2>`;
      if (/^# /.test(line)) return `<h1>${line.slice(2)}</h1>`;
      if (/^### /.test(line)) return `<h3>${line.slice(4)}</h3>`;
      if (/^[-*] /.test(line)) return `<li>${line.slice(2)}</li>`;
      if (line.trim() === '') return '<br/>';
      if (line.trim().startsWith('|')) {
        const cells = line.split('|').filter((c) => c.trim()).map((c) => `<td>${c.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }
      return `<p>${line}</p>`;
    })
    .join('\n');
}

export function emptyEngineeringSections(): Record<EngineeringSectionKey, string> {
  return emptySections();
}

export function buildCadPrompt(input: {
  prompt: string;
  projectType: EngineeringProjectType;
  constraints: EngineeringConstraints;
}): string {
  const { prompt, projectType, constraints } = input;
  const constraintLines = [
    constraints.dimensions && `Dimensions: ${constraints.dimensions}`,
    constraints.weight && `Weight: ${constraints.weight}`,
    constraints.budget && `Budget: ${constraints.budget}`,
    constraints.voltage && `Voltage: ${constraints.voltage}`,
    constraints.skillLevel && `Skill: ${constraints.skillLevel}`,
  ].filter(Boolean);

  return [
    `Design a single 3D printable mechanical part in OpenSCAD for: ${prompt.trim()}`,
    `Project context: ${PROJECT_TYPE_LABELS[projectType]}`,
    constraintLines.length ? `Constraints:\n${constraintLines.join("\n")}` : "",
    "Output requirements: millimeters, parametric variables, wall thickness 2–3mm where applicable.",
    "Example: drone cap Ø80mm, height 25mm, M3 mounting holes at 45° on rim.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function extractScadBlock(markdown: string): string | null {
  const match = markdown.match(/```(?:openscad|scad)\s*([\s\S]*?)```/i);
  if (!match) return null;
  const source = match[1].trim();
  return source || null;
}
