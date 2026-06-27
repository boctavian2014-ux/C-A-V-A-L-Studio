// Canonical CAD prompt + mapping for Engineering AI (EngProject → CAD server).
import type {
  CadConstraints,
  CadPlanContext,
} from '../../engineering/cad-server/types';
import type { BuildFile, EngProject, SpecData } from './engineering-generator';

/** Engineering plan passed from generator / AI panel into CAD pipeline. */
export type EngineeringPlan = EngProject;

export function inferCadProjectType(userPrompt: string, spec: SpecData): string {
  const text = `${userPrompt} ${spec.title} ${spec.summary}`.toLowerCase();
  if (/esp32|home assistant|wireless|senzor|wifi|iot|smart home|incarcare|oled|calitate.*aer|air quality/i.test(text)) {
    return 'iot';
  }
  if (/dron|drone|fpv|quad|copter/i.test(text)) return 'drone';
  if (/robot/i.test(text)) return 'robot';
  return 'custom';
}

/** Turn user intent + BOM into mandatory 3D geometry (cutouts, vents, mounts). */
export function inferCadPhysicalFeatures(userPrompt: string, project?: EngProject): string[] {
  const partsHint = project?.parts?.map((p) => p.name).join(' ') ?? '';
  const stlNote = project?.build?.find((b) => b.kind === 'stl')?.note ?? '';
  const text = `${userPrompt} ${project?.spec?.title ?? ''} ${project?.spec?.summary ?? ''} ${partsHint} ${stlNote}`.toLowerCase();
  const features: string[] = [];

  if (/oled|ecran|display|lcd|0\.96|128\s*[x×]\s*64/i.test(text)) {
    features.push(
      'Față: decupaj/fereastră OLED ~27.3×27.3 mm (display 0.96"), chenar 2 mm, adâncime 1.5 mm — NU față solidă.'
    );
  }
  if (/calitate.*aer|air quality|pm2\.?5|pms5003|sgp30|voc|co2|senzor.*aer|aqi/i.test(text)) {
    features.push(
      'Lateral: grilă ventilație pentru senzor (flux aer) — min. 3 fante ~10×3 mm sau pattern perforat, NU cutie etanșă.'
    );
  }
  if (/wifi|wireless|esp32|bluetooth|antena|antenna/i.test(text)) {
    features.push(
      'Zonă antenă ESP32: perete subțire (<1 mm) sau decupaj pe lateral — fără plastic masiv care blochează 2.4 GHz.'
    );
  }
  if (/alert|alertă|buzzer|beep|sonor|alarm|notific/i.test(text)) {
    features.push('Gaură buzzer Ø12 mm (față/sus) + opțional LED indicator Ø5 mm.');
  }
  if (/senzor|sensor|iot|esp32|mcu|pcb|electron|arduino/i.test(text)) {
    features.push(
      'Interior: 4× standoff M2.5 (~15 mm), bay PCB ~68×26 mm (ESP32 devkit), canal cabluri I²C/UART.'
    );
    features.push('Carcasă în 2 piese: bază + capac, clips snap-fit sau 4× bossuri M3 pe colțuri.');
  }

  return features;
}

/** Single source of truth for CAD technical prompt (replaces buildCadPromptFromEng). */
export function buildCadTechnicalPrompt(project: EngProject, userPrompt: string): string {
  const { spec, build, schema, parts } = project;
  const primaryStl = build.find((b) => b.kind === 'stl');
  const stlTarget = primaryStl ? `${primaryStl.name}: ${primaryStl.note}` : '';
  const componentHint = parts
    .slice(0, 8)
    .map((p) => `${p.name}×${p.qty}`)
    .join(', ');
  const schemaHint = schema.nodes.map((n) => `${n.label} (${n.role})`).join(' → ');
  const physicalFeatures = inferCadPhysicalFeatures(userPrompt, project);

  return [
    `USER INTENT (must match geometry): ${userPrompt.trim()}`,
    'Design ONE functional 3D-printable mechanical part (OpenSCAD pipeline).',
    'FORBIDDEN: plain hollow box, generic cube, or unrelated shape when user asked for sensor/display/enclosure features.',
    `Title: ${spec.title}`,
    spec.summary,
    spec.dimensions ? `Overall dimensions: ${spec.dimensions}` : '',
    spec.weight ? `Target weight: ${spec.weight}` : '',
    spec.materials?.length ? `Materials: ${spec.materials.join(', ')}` : '',
    stlTarget ? `Primary STL target: ${stlTarget}` : '',
    primaryStl?.content ? `STL design notes: ${primaryStl.content.slice(0, 400)}` : '',
    schemaHint ? `Electronic block diagram: ${schemaHint}` : '',
    componentHint ? `Key components (size cutouts/vents to fit): ${componentHint}` : '',
    physicalFeatures.length
      ? `MANDATORY GEOMETRY (include ALL in the model):\n${physicalFeatures.map((f) => `- ${f}`).join('\n')}`
      : '',
    /esp32|wireless|home assistant|senzor|oled/i.test(userPrompt)
      ? 'IoT enclosure: model cutouts, vents, standoffs, and antenna clearance — not a blank box.'
      : '',
    'Use millimeters. Parametric where possible. Include mounting features when relevant.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Unified CAD prompt entry point for client + server. */
export function buildCadPrompt(plan: EngineeringPlan, userPrompt: string): string {
  return buildCadTechnicalPrompt(plan, userPrompt);
}

export function mapEngProjectToPlanContext(project: EngProject): CadPlanContext {
  const componentsList = project.parts
    .slice(0, 12)
    .map((p) => `${p.name} ×${p.qty}`)
    .join(', ');
  return {
    requirements: project.spec.summary,
    assembly: project.schema.connections
      .slice(0, 6)
      .map((c) => `${c.from}→${c.to} (${c.label})`)
      .join('; '),
    components: componentsList || project.spec.title,
    performance: [project.spec.dimensions, project.schema.powerBudget].filter(Boolean).join('; '),
  };
}

export function mapEngProjectToConstraints(spec: SpecData): CadConstraints {
  return {
    dimensions: spec.dimensions !== '—' ? spec.dimensions : undefined,
    weight: spec.weight !== '—' ? spec.weight : undefined,
    skillLevel: 'intermediate',
  };
}
