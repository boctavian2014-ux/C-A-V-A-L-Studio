/**
 * Pure STL bake helpers (no Three.js dependency) for tests + viewer export.
 * Matrix is column-major 4x4 (Three.js Matrix4.toArray() layout).
 */

export function transformPositions(
  positions: ArrayLike<number>,
  matrix: ArrayLike<number>
): Float32Array {
  const out = new Float32Array(positions.length);
  const m = matrix;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = positions[i]!;
    const y = positions[i + 1]!;
    const z = positions[i + 2]!;
    const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
    const invW = w !== 0 && w !== 1 ? 1 / w : 1;
    out[i] = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) * invW;
    out[i + 1] = (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) * invW;
    out[i + 2] = (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) * invW;
  }
  return out;
}

export function expandIndexedPositions(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>
): Float32Array {
  const out = new Float32Array(indices.length * 3);
  for (let i = 0; i < indices.length; i++) {
    const vi = indices[i]! * 3;
    const oi = i * 3;
    out[oi] = positions[vi]!;
    out[oi + 1] = positions[vi + 1]!;
    out[oi + 2] = positions[vi + 2]!;
  }
  return out;
}

function writeFloat32LE(view: DataView, offset: number, value: number): void {
  view.setFloat32(offset, value, true);
}

function faceNormal(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number
): [number, number, number] {
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  if (len > 1e-12) {
    nx /= len;
    ny /= len;
    nz /= len;
  } else {
    nx = 0;
    ny = 0;
    nz = 0;
  }
  return [nx, ny, nz];
}

/** Triangle-list positions (length must be multiple of 9) → binary STL ArrayBuffer. */
export function positionsToBinaryStl(positions: ArrayLike<number>): ArrayBuffer {
  const triCount = Math.floor(positions.length / 9);
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);
  const header = 'CAVALLO STL bake';
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
  }
  view.setUint32(80, triCount, true);

  let offset = 84;
  for (let t = 0; t < triCount; t++) {
    const i = t * 9;
    const ax = positions[i]!;
    const ay = positions[i + 1]!;
    const az = positions[i + 2]!;
    const bx = positions[i + 3]!;
    const by = positions[i + 4]!;
    const bz = positions[i + 5]!;
    const cx = positions[i + 6]!;
    const cy = positions[i + 7]!;
    const cz = positions[i + 8]!;
    const [nx, ny, nz] = faceNormal(ax, ay, az, bx, by, bz, cx, cy, cz);
    writeFloat32LE(view, offset, nx);
    writeFloat32LE(view, offset + 4, ny);
    writeFloat32LE(view, offset + 8, nz);
    writeFloat32LE(view, offset + 12, ax);
    writeFloat32LE(view, offset + 16, ay);
    writeFloat32LE(view, offset + 20, az);
    writeFloat32LE(view, offset + 24, bx);
    writeFloat32LE(view, offset + 28, by);
    writeFloat32LE(view, offset + 32, bz);
    writeFloat32LE(view, offset + 36, cx);
    writeFloat32LE(view, offset + 40, cy);
    writeFloat32LE(view, offset + 44, cz);
    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }
  return buffer;
}

export function bakeMeshToBinaryStl(input: {
  positions: ArrayLike<number>;
  indices?: ArrayLike<number> | null;
  matrix?: ArrayLike<number> | null;
}): ArrayBuffer {
  let pos =
    input.indices && input.indices.length > 0
      ? expandIndexedPositions(input.positions, input.indices)
      : Float32Array.from(input.positions as ArrayLike<number>);
  if (input.matrix && input.matrix.length >= 16) {
    pos = transformPositions(pos, input.matrix);
  }
  return positionsToBinaryStl(pos);
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function identityMatrix4(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
