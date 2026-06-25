import type { StlDimensions } from "./types";

/** Compute axis-aligned bounding box from a binary STL buffer. */
export function computeStlBoundingBox(buffer: Buffer): StlDimensions | null {
  if (buffer.length < 84) return null;

  const triangleCount = buffer.readUInt32LE(80);
  const expectedSize = 84 + triangleCount * 50;
  if (buffer.length < expectedSize || triangleCount === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  let offset = 84;
  for (let i = 0; i < triangleCount; i++) {
    offset += 12; // skip normal
    for (let v = 0; v < 3; v++) {
      const x = buffer.readFloatLE(offset);
      const y = buffer.readFloatLE(offset + 4);
      const z = buffer.readFloatLE(offset + 8);
      offset += 12;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    offset += 2; // attribute byte count
  }

  if (!Number.isFinite(minX)) return null;

  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    x: round(maxX - minX),
    y: round(maxY - minY),
    z: round(maxZ - minZ),
  };
}
