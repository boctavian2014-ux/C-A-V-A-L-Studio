export type CadToolMode = 'idle' | 'measure' | 'section' | 'gizmo';
export type CadGizmoMode = 'translate' | 'rotate' | 'scale';
export type CadCameraPreset = 'fit' | 'iso' | 'front' | 'top' | 'right';
export type CadSectionAxis = 'x' | 'y' | 'z';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export function distanceMm(a: Vec3Like, b: Vec3Like): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function formatDistanceMm(distance: number): string {
  const rounded = Math.round(distance * 100) / 100;
  return `${rounded} mm`;
}

/** Unit normal for a section clip plane. */
export function clipPlaneNormal(axis: CadSectionAxis): Vec3Like {
  if (axis === 'x') return { x: 1, y: 0, z: 0 };
  if (axis === 'y') return { x: 0, y: 1, z: 0 };
  return { x: 0, y: 0, z: 1 };
}

/**
 * Three.js Plane: normal · x + constant = 0.
 * Offset slides the plane along the normal from the origin (model is centered).
 */
export function clipPlaneConstant(_axis: CadSectionAxis, offset: number): number {
  // Unit axis normal → plane equation normal·x + constant = 0 with constant = -offset.
  return -offset;
}

/** Radial explode offsets in XZ for N parts; amount in 0..1. */
export function explodeOffsets(
  count: number,
  amount: number,
  radius = 40
): Vec3Like[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 0, y: 0, z: 0 }];
  const t = Math.max(0, Math.min(1, amount));
  const out: Vec3Like[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    out.push({
      x: Math.cos(angle) * radius * t,
      y: 0,
      z: Math.sin(angle) * radius * t,
    });
  }
  return out;
}

export interface CameraLookAt {
  position: Vec3Like;
  target: Vec3Like;
}

/**
 * Camera presets around a sphere of given radius centered at `center`.
 * `fit` uses a diagonal iso-ish viewpoint scaled to the radius.
 */
export function cameraPresetLookAt(
  preset: CadCameraPreset,
  radius: number,
  center: Vec3Like = { x: 0, y: 0, z: 0 }
): CameraLookAt {
  const r = Math.max(radius, 1) * 2.2;
  const c = center;
  switch (preset) {
    case 'front':
      return { position: { x: c.x, y: c.y, z: c.z + r }, target: { ...c } };
    case 'top':
      return { position: { x: c.x, y: c.y + r, z: c.z + 0.01 }, target: { ...c } };
    case 'right':
      return { position: { x: c.x + r, y: c.y, z: c.z }, target: { ...c } };
    case 'iso':
      return {
        position: { x: c.x + r * 0.75, y: c.y + r * 0.65, z: c.z + r * 0.75 },
        target: { ...c },
      };
    case 'fit':
    default:
      return {
        position: { x: c.x + r * 0.7, y: c.y + r * 0.55, z: c.z + r * 0.7 },
        target: { ...c },
      };
  }
}

export function isTransformDirty(
  position: Vec3Like,
  rotation: Vec3Like,
  scale: Vec3Like,
  epsilon = 1e-4
): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) < epsilon;
  return !(
    near(position.x, 0) &&
    near(position.y, 0) &&
    near(position.z, 0) &&
    near(rotation.x, 0) &&
    near(rotation.y, 0) &&
    near(rotation.z, 0) &&
    near(scale.x, 1) &&
    near(scale.y, 1) &&
    near(scale.z, 1)
  );
}
