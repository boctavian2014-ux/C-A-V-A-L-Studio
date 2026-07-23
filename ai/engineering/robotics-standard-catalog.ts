/**
 * Bundled mirror of libraries/robotics-standard/metadata/components.json
 * Used offline for classifier / prompts. CDN is source of truth at runtime.
 */

export interface RoboticsCatalogEntry {
  path: string;
  format: 'scad' | 'stl';
  tags: string[];
  label?: string;
  category?: string;
}

export const ROBOTICS_STANDARD_CATALOG: Record<string, RoboticsCatalogEntry> = {
  mg996r_servo_bracket: {
    path: 'brackets/mg996r.scad',
    format: 'scad',
    tags: ['servo', 'bracket', 'mg996r', 'mg996'],
    label: 'MG996R servo bracket',
    category: 'brackets',
  },
  sg90_servo_bracket: {
    path: 'brackets/sg90.scad',
    format: 'scad',
    tags: ['servo', 'bracket', 'sg90', 'micro'],
    label: 'SG90 servo bracket',
    category: 'brackets',
  },
  ds3218_servo_bracket: {
    path: 'brackets/ds3218.scad',
    format: 'scad',
    tags: ['servo', 'bracket', 'ds3218', '25kg'],
    label: 'DS3218 / 25kg servo bracket',
    category: 'brackets',
  },
  wheel_65mm: {
    path: 'wheels/wheel_65mm.scad',
    format: 'scad',
    tags: ['wheel', '65mm', 'tire'],
    label: 'Wheel 65mm',
    category: 'wheels',
  },
  wheel_80mm: {
    path: 'wheels/wheel_80mm.scad',
    format: 'scad',
    tags: ['wheel', '80mm'],
    label: 'Wheel 80mm',
    category: 'wheels',
  },
  omni_100mm: {
    path: 'wheels/omni_100mm.scad',
    format: 'scad',
    tags: ['wheel', 'omni', '100mm'],
    label: 'Omni wheel 100mm (printable hub)',
    category: 'wheels',
  },
  mecanum_80mm: {
    path: 'wheels/mecanum_80mm.scad',
    format: 'scad',
    tags: ['wheel', 'mecanum', '80mm'],
    label: 'Mecanum wheel 80mm (printable hub)',
    category: 'wheels',
  },
  planetary_37gb: {
    path: 'gearbox/planetary_37gb.scad',
    format: 'scad',
    tags: ['gearbox', 'planetary', '37gb'],
    label: '37GB planetary gearbox shell',
    category: 'gearbox',
  },
  spur_775: {
    path: 'gearbox/spur_775.scad',
    format: 'scad',
    tags: ['gearbox', 'spur', '775'],
    label: '775 spur gearbox mount',
    category: 'gearbox',
  },
  worm_gearbox: {
    path: 'gearbox/worm_gearbox.scad',
    format: 'scad',
    tags: ['gearbox', 'worm'],
    label: 'Worm gearbox housing',
    category: 'gearbox',
  },
  tof_mount: {
    path: 'mounts/tof_mount.scad',
    format: 'scad',
    tags: ['mount', 'tof', 'vl53', 'sensor'],
    label: 'ToF sensor mount',
    category: 'mounts',
  },
  lidar_mount: {
    path: 'mounts/lidar_mount.scad',
    format: 'scad',
    tags: ['mount', 'lidar', 'sensor'],
    label: 'Lidar mount',
    category: 'mounts',
  },
  camera_mount: {
    path: 'mounts/camera_mount.scad',
    format: 'scad',
    tags: ['mount', 'camera', 'webcam'],
    label: 'Camera mount',
    category: 'mounts',
  },
  profile_2020: {
    path: 'profiles/2020.scad',
    format: 'scad',
    tags: ['profile', '2020', 'extrusion'],
    label: '2020 extrusion profile (printable sample)',
    category: 'profiles',
  },
  profile_2040: {
    path: 'profiles/2040.scad',
    format: 'scad',
    tags: ['profile', '2040', 'extrusion'],
    label: '2040 extrusion profile (printable sample)',
    category: 'profiles',
  },
  corner_connector: {
    path: 'profiles/connectors/corner.scad',
    format: 'scad',
    tags: ['connector', 'corner', '2020'],
    label: 'Corner connector 2020',
    category: 'profiles',
  },
  t_connector: {
    path: 'profiles/connectors/t_connector.scad',
    format: 'scad',
    tags: ['connector', 't', '2020'],
    label: 'T connector 2020',
    category: 'profiles',
  },
  holder_18650: {
    path: 'batteries/18650_holder.scad',
    format: 'scad',
    tags: ['battery', '18650', 'holder'],
    label: '18650 battery holder',
    category: 'batteries',
  },
  lipo_3s_holder: {
    path: 'batteries/lipo_3s_holder.scad',
    format: 'scad',
    tags: ['battery', 'lipo', '3s', 'holder'],
    label: 'LiPo 3S holder',
    category: 'batteries',
  },
  holder_9v: {
    path: 'batteries/9v_holder.scad',
    format: 'scad',
    tags: ['battery', '9v', 'holder'],
    label: '9V battery holder',
    category: 'batteries',
  },
  n20_mount: {
    path: 'motors/n20_mount.scad',
    format: 'scad',
    tags: ['motor', 'n20', 'mount'],
    label: 'N20 motor mount',
    category: 'motors',
  },
  '37gb_mount': {
    path: 'motors/37gb_mount.scad',
    format: 'scad',
    tags: ['motor', '37gb', 'mount'],
    label: '37GB motor mount',
    category: 'motors',
  },
  '775_mount': {
    path: 'motors/775_mount.scad',
    format: 'scad',
    tags: ['motor', '775', 'mount'],
    label: '775 motor mount',
    category: 'motors',
  },
  wheel_hub_universal: {
    path: 'hubs/wheel_hub_universal.scad',
    format: 'scad',
    tags: ['hub', 'wheel', 'axle'],
    label: 'Universal wheel hub',
    category: 'hubs',
  },
  axle_adapter: {
    path: 'hubs/axle_adapter.scad',
    format: 'scad',
    tags: ['axle', 'adapter', 'hub'],
    label: 'Axle adapter',
    category: 'hubs',
  },
  pcb_holder_universal: {
    path: 'mounts/pcb_holder.scad',
    format: 'scad',
    tags: ['pcb', 'holder', 'mount'],
    label: 'Universal PCB holder',
    category: 'mounts',
  },
};

export function formatCatalogKeysForPrompt(
  catalog: Record<string, RoboticsCatalogEntry> = ROBOTICS_STANDARD_CATALOG
): string {
  return Object.entries(catalog)
    .map(([key, e]) => `- ${key} (${e.label ?? key}) tags: ${e.tags.join(', ')}`)
    .join('\n');
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Re-assign mode/standardKey using catalog fuzzy match. */
export function classifyAgainstCatalog<
  T extends { name: string; mode: 'standard' | 'custom'; standardKey?: string },
>(
  component: T,
  catalog: Record<string, RoboticsCatalogEntry> = ROBOTICS_STANDARD_CATALOG
): T {
  if (component.standardKey && catalog[component.standardKey]) {
    return { ...component, mode: 'standard', standardKey: component.standardKey };
  }

  const needle = normalize(component.standardKey || component.name);
  let bestKey: string | null = null;
  let bestScore = 0;

  for (const [key, entry] of Object.entries(catalog)) {
    const candidates = [key, entry.label ?? '', ...entry.tags].map(normalize);
    for (const c of candidates) {
      if (!c) continue;
      if (needle === c || needle.includes(c) || c.includes(needle)) {
        const score = c.length;
        if (score > bestScore) {
          bestScore = score;
          bestKey = key;
        }
      }
    }
  }

  if (bestKey && bestScore >= 4) {
    return { ...component, mode: 'standard', standardKey: bestKey };
  }

  return { ...component, mode: 'custom', standardKey: undefined };
}
