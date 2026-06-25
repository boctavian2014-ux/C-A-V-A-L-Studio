import { describe, expect, it } from "vitest";
import { computeStlBoundingBox } from "../../engineering/cad-server/stl-bbox";

/** Minimal binary STL: one triangle with bbox 10×20×0. */
function makeTriangleStl(): Buffer {
  const buf = Buffer.alloc(84 + 50);
  buf.writeUInt32LE(1, 80);
  let o = 84;
  // normal (0,0,1)
  buf.writeFloatLE(0, o); o += 4;
  buf.writeFloatLE(0, o); o += 4;
  buf.writeFloatLE(1, o); o += 4;
  // v1 (0,0,0)
  buf.writeFloatLE(0, o); o += 4;
  buf.writeFloatLE(0, o); o += 4;
  buf.writeFloatLE(0, o); o += 4;
  // v2 (10,0,0)
  buf.writeFloatLE(10, o); o += 4;
  buf.writeFloatLE(0, o); o += 4;
  buf.writeFloatLE(0, o); o += 4;
  // v3 (0,20,0)
  buf.writeFloatLE(0, o); o += 4;
  buf.writeFloatLE(20, o); o += 4;
  buf.writeFloatLE(0, o); o += 4;
  buf.writeUInt16LE(0, o);
  return buf;
}

describe("computeStlBoundingBox", () => {
  it("returns null for empty buffer", () => {
    expect(computeStlBoundingBox(Buffer.alloc(10))).toBeNull();
  });

  it("computes dimensions from binary STL", () => {
    const dims = computeStlBoundingBox(makeTriangleStl());
    expect(dims).not.toBeNull();
    expect(dims!.x).toBe(10);
    expect(dims!.y).toBe(20);
  });
});
