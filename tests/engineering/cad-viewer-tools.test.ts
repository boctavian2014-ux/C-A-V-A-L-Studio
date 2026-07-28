import { describe, expect, it } from "vitest";
import {
  cameraPresetLookAt,
  clipPlaneConstant,
  clipPlaneNormal,
  distanceMm,
  explodeOffsets,
  formatDistanceMm,
  isTransformDirty,
} from "../../src/renderer/components/engineering/cad-viewer-tools";
import {
  arrayBufferToBase64,
  bakeMeshToBinaryStl,
  expandIndexedPositions,
  identityMatrix4,
  positionsToBinaryStl,
  transformPositions,
} from "../../src/renderer/components/engineering/stl-bake";

describe("cad-viewer-tools", () => {
  it("computes distance in mm", () => {
    expect(distanceMm({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBe(5);
    expect(formatDistanceMm(12.345)).toBe("12.35 mm");
  });

  it("builds clip plane normal and constant", () => {
    expect(clipPlaneNormal("x")).toEqual({ x: 1, y: 0, z: 0 });
    expect(clipPlaneNormal("y")).toEqual({ x: 0, y: 1, z: 0 });
    expect(clipPlaneConstant("z", 12)).toBe(-12);
  });

  it("computes radial explode offsets", () => {
    expect(explodeOffsets(1, 1)).toEqual([{ x: 0, y: 0, z: 0 }]);
    const zero = explodeOffsets(4, 0, 40);
    expect(zero.every((o) => o.x === 0 && o.z === 0)).toBe(true);
    const full = explodeOffsets(4, 1, 40);
    expect(full).toHaveLength(4);
    expect(Math.hypot(full[0]!.x, full[0]!.z)).toBeCloseTo(40, 5);
  });

  it("camera presets look at center", () => {
    const front = cameraPresetLookAt("front", 10);
    expect(front.target).toEqual({ x: 0, y: 0, z: 0 });
    expect(front.position.z).toBeGreaterThan(0);
    const top = cameraPresetLookAt("top", 10);
    expect(top.position.y).toBeGreaterThan(0);
  });

  it("detects transform dirty state", () => {
    expect(
      isTransformDirty(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 1, z: 1 }
      )
    ).toBe(false);
    expect(
      isTransformDirty(
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 1, z: 1 }
      )
    ).toBe(true);
  });
});

describe("stl-bake", () => {
  it("expands indexed positions", () => {
    const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const idx = [0, 1, 2];
    const expanded = expandIndexedPositions(pos, idx);
    expect(Array.from(expanded)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  });

  it("applies translation matrix to positions", () => {
    const m = identityMatrix4();
    m[12] = 10; // translate x
    const out = transformPositions(new Float32Array([1, 2, 3]), m);
    expect(out[0]).toBeCloseTo(11);
    expect(out[1]).toBeCloseTo(2);
    expect(out[2]).toBeCloseTo(3);
  });

  it("writes binary STL with triangle count", () => {
    // one triangle
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const buf = positionsToBinaryStl(positions);
    expect(buf.byteLength).toBe(84 + 50);
    const view = new DataView(buf);
    expect(view.getUint32(80, true)).toBe(1);
  });

  it("bakes scaled mesh and encodes base64", () => {
    const positions = new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0]);
    const m = identityMatrix4();
    m[0] = 2; // scale x
    const buf = bakeMeshToBinaryStl({ positions, matrix: m });
    const view = new DataView(buf);
    expect(view.getUint32(80, true)).toBe(1);
    // vertex B x should be 4
    expect(view.getFloat32(84 + 24, true)).toBeCloseTo(4);
    const b64 = arrayBufferToBase64(buf);
    expect(b64.length).toBeGreaterThan(20);
    expect(Buffer.from(b64, "base64").byteLength).toBe(buf.byteLength);
  });
});
