/** Robotics dual-mode component BOM schema + parsers. */

export type RoboticsComponentCategory =
  | 'mechanical'
  | 'electronics'
  | 'sensor'
  | 'actuator'
  | 'structure'
  | 'other';

export type RoboticsComponentMode = 'standard' | 'custom';

export interface RoboticsComponentDimensions {
  width?: number;
  height?: number;
  depth?: number;
  unit?: 'mm' | 'cm' | 'in';
}

export interface RoboticsBomComponent {
  id: string;
  name: string;
  category: RoboticsComponentCategory;
  mode: RoboticsComponentMode;
  /** Key into libraries/robotics-standard metadata when mode=standard. */
  standardKey?: string;
  dimensions?: RoboticsComponentDimensions;
  material?: string;
  qty: number;
  notes?: string;
}

export interface RoboticsComponentBom {
  components: RoboticsBomComponent[];
  assemblyHints?: string;
}

export const ROBOTICS_COMPONENT_JSON_SCHEMA = {
  type: 'object',
  required: ['components'],
  properties: {
    components: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'category', 'mode', 'qty'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          category: {
            type: 'string',
            enum: ['mechanical', 'electronics', 'sensor', 'actuator', 'structure', 'other'],
          },
          mode: { type: 'string', enum: ['standard', 'custom'] },
          standardKey: { type: 'string' },
          dimensions: {
            type: 'object',
            properties: {
              width: { type: 'number' },
              height: { type: 'number' },
              depth: { type: 'number' },
              unit: { type: 'string', enum: ['mm', 'cm', 'in'] },
            },
          },
          material: { type: 'string' },
          qty: { type: 'number', minimum: 1 },
          notes: { type: 'string' },
        },
      },
    },
    assemblyHints: { type: 'string' },
  },
} as const;

const CATEGORIES = new Set<RoboticsComponentCategory>([
  'mechanical',
  'electronics',
  'sensor',
  'actuator',
  'structure',
  'other',
]);

function slugId(raw: string, index: number): string {
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return base || `part_${index + 1}`;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

export function parseRoboticsComponentBom(raw: unknown): RoboticsComponentBom | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const list = obj.components;
  if (!Array.isArray(list) || list.length === 0) return null;

  const components: RoboticsBomComponent[] = [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name) continue;
    const categoryRaw = typeof r.category === 'string' ? r.category.toLowerCase() : 'other';
    const category = CATEGORIES.has(categoryRaw as RoboticsComponentCategory)
      ? (categoryRaw as RoboticsComponentCategory)
      : 'other';
    const mode: RoboticsComponentMode = r.mode === 'standard' ? 'standard' : 'custom';
    const qty = Math.max(1, Math.floor(asNumber(r.qty) ?? 1));
    const id =
      typeof r.id === 'string' && r.id.trim() ? r.id.trim() : slugId(name, i);
    const dimsRaw = r.dimensions;
    let dimensions: RoboticsComponentDimensions | undefined;
    if (dimsRaw && typeof dimsRaw === 'object') {
      const d = dimsRaw as Record<string, unknown>;
      dimensions = {
        width: asNumber(d.width),
        height: asNumber(d.height),
        depth: asNumber(d.depth),
        unit: d.unit === 'cm' || d.unit === 'in' ? d.unit : 'mm',
      };
    }
    components.push({
      id,
      name,
      category,
      mode,
      standardKey: typeof r.standardKey === 'string' ? r.standardKey.trim() || undefined : undefined,
      dimensions,
      material: typeof r.material === 'string' ? r.material : undefined,
      qty,
      notes: typeof r.notes === 'string' ? r.notes : undefined,
    });
  }

  if (components.length === 0) return null;
  return {
    components,
    assemblyHints: typeof obj.assemblyHints === 'string' ? obj.assemblyHints : undefined,
  };
}

/** Extract first JSON object from model text (fenced or raw). */
export function extractJsonObject(text: string): unknown | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1]?.trim() || text.trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}
