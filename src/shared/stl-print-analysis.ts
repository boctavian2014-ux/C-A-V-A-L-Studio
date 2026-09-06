/**
 * Local CPU STL printability analysis + FDM suggestions.
 * No GPU / cloud — safe to call from main (IPC) or unit tests.
 */

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface StlTriangle {
  normal: Vector3;
  v1: Vector3;
  v2: Vector3;
  v3: Vector3;
}

export interface GeometryFeatures {
  hasOverhangs: boolean;
  maxOverhangAngleDeg: number;
  hasBridges: boolean;
  maxBridgeLengthMm: number;
  hasThinWalls: boolean;
  minWallThicknessMm: number;
  hasFlatBase: boolean;
  flatBaseAreaMm2: number;
  curvedSurfacesPercent: number;
}

export interface StlAnalysis {
  volumeMm3: number;
  surfaceAreaMm2: number;
  boundingBox: { x: number; y: number; z: number };
  triangleCount: number;
  features: GeometryFeatures;
  printabilityScore: number;
}

export type InfillPattern = "grid" | "gyroid" | "honeycomb" | "triangular" | "cubic";

export interface PrintSuggestion {
  orientation: {
    rotationX: number;
    rotationY: number;
    rotationZ: number;
    reason: string;
    supportReductionPercent: number;
  };
  layerHeight: {
    recommended: number;
    min: number;
    max: number;
    reason: string;
  };
  infill: {
    pattern: InfillPattern;
    density: number;
    reason: string;
  };
  supports: {
    needed: boolean;
    type: "normal" | "tree" | "organic";
    overhangThreshold: number;
    reason: string;
  };
  estimatedPrintTimeMinutes: number;
  estimatedMaterialGrams: number;
}

function readVec3(view: DataView, offset: number): Vector3 {
  return {
    x: view.getFloat32(offset, true),
    y: view.getFloat32(offset + 4, true),
    z: view.getFloat32(offset + 8, true),
  };
}

function subtract(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function magnitude(v: Vector3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function triangleArea(tri: StlTriangle): number {
  return magnitude(cross(subtract(tri.v2, tri.v1), subtract(tri.v3, tri.v1))) / 2;
}

function angleFromVertical(normal: Vector3): number {
  const nMag = magnitude(normal);
  if (nMag < 1e-9) return 0;
  const nz = Math.abs(normal.z / nMag);
  const clamped = Math.min(1, Math.max(0, nz));
  return Math.acos(clamped) * (180 / Math.PI);
}

/** Parse binary STL into triangles. Throws on invalid buffer. */
export function parseBinaryStl(buffer: ArrayBuffer | Uint8Array | Buffer): StlTriangle[] {
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (bytes.byteLength < 84) throw new Error("STL too small");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triangleCount = view.getUint32(80, true);
  const expected = 84 + triangleCount * 50;
  if (bytes.byteLength < expected) throw new Error("STL truncated");
  if (triangleCount === 0) throw new Error("STL has no triangles");

  const triangles: StlTriangle[] = [];
  let offset = 84;
  for (let i = 0; i < triangleCount; i++) {
    const normal = readVec3(view, offset);
    const v1 = readVec3(view, offset + 12);
    const v2 = readVec3(view, offset + 24);
    const v3 = readVec3(view, offset + 36);
    triangles.push({ normal, v1, v2, v3 });
    offset += 50;
  }
  return triangles;
}

export function analyzeStlTriangles(triangles: StlTriangle[]): StlAnalysis {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let volume = 0;
  let surfaceArea = 0;
  let maxOverhangAngle = 0;
  let flatBaseArea = 0;
  let curvedTriangles = 0;
  let maxEdge = 0;

  for (const tri of triangles) {
    for (const v of [tri.v1, tri.v2, tri.v3]) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
      if (v.z > maxZ) maxZ = v.z;
    }

    // Ensure consistent winding vs facet normal before signed-volume accumulate.
    const a = tri.v1;
    let b = tri.v2;
    let c = tri.v3;
    const computed = cross(subtract(b, a), subtract(c, a));
    if (dot(computed, tri.normal) < 0) {
      const tmp = b;
      b = c;
      c = tmp;
    }
    volume += dot(a, cross(b, c)) / 6;
    const area = triangleArea(tri);
    surfaceArea += area;

    const angle = angleFromVertical(tri.normal);
    if (angle > maxOverhangAngle) maxOverhangAngle = angle;

    const edges = [
      magnitude(subtract(tri.v2, tri.v1)),
      magnitude(subtract(tri.v3, tri.v2)),
      magnitude(subtract(tri.v1, tri.v3)),
    ];
    for (const e of edges) if (e > maxEdge) maxEdge = e;

    const nMag = magnitude(tri.normal);
    const nz = nMag > 1e-9 ? tri.normal.z / nMag : 0;
    const avgZ = (tri.v1.z + tri.v2.z + tri.v3.z) / 3;
    if (Math.abs(avgZ - minZ) < 0.15 && nz < -0.85) {
      flatBaseArea += area;
    }

    // Heuristic curvature: normals far from axis-aligned ≈ curved / organic faces.
    const nx = nMag > 1e-9 ? Math.abs(tri.normal.x / nMag) : 0;
    const ny = nMag > 1e-9 ? Math.abs(tri.normal.y / nMag) : 0;
    if (nz < 0.92 && nx < 0.92 && ny < 0.92) curvedTriangles += 1;
  }

  const bbox = {
    x: Math.max(0, maxX - minX),
    y: Math.max(0, maxY - minY),
    z: Math.max(0, maxZ - minZ),
  };

  const minDim = Math.min(bbox.x, bbox.y, bbox.z);
  const hasThinWalls = minDim > 0 && minDim < 1.2;
  const hasOverhangs = maxOverhangAngle > 45;
  // Bridge heuristic: long horizontal span relative to height.
  const horizontalSpan = Math.max(bbox.x, bbox.y);
  const maxBridgeLengthMm = bbox.z > 0 && horizontalSpan > bbox.z * 1.5 ? horizontalSpan : 0;
  const hasBridges = maxBridgeLengthMm > 10;
  const curvedSurfacesPercent =
    triangles.length > 0 ? (curvedTriangles / triangles.length) * 100 : 0;
  const hasFlatBase = flatBaseArea >= 50;

  const features: GeometryFeatures = {
    hasOverhangs,
    maxOverhangAngleDeg: Math.round(maxOverhangAngle * 10) / 10,
    hasBridges,
    maxBridgeLengthMm: Math.round(maxBridgeLengthMm * 10) / 10,
    hasThinWalls,
    minWallThicknessMm: Math.round(minDim * 100) / 100,
    hasFlatBase,
    flatBaseAreaMm2: Math.round(flatBaseArea * 10) / 10,
    curvedSurfacesPercent: Math.round(curvedSurfacesPercent * 10) / 10,
  };

  let score = 100;
  if (features.hasOverhangs) score -= 20;
  if (features.maxOverhangAngleDeg > 60) score -= 15;
  if (features.hasBridges) score -= 10;
  if (features.hasThinWalls) score -= 15;
  if (!features.hasFlatBase) score -= 10;
  if (features.curvedSurfacesPercent > 70) score -= 5;

  return {
    volumeMm3: Math.round(Math.abs(volume) * 10) / 10,
    surfaceAreaMm2: Math.round(surfaceArea * 10) / 10,
    boundingBox: {
      x: Math.round(bbox.x * 10) / 10,
      y: Math.round(bbox.y * 10) / 10,
      z: Math.round(bbox.z * 10) / 10,
    },
    triangleCount: triangles.length,
    features,
    printabilityScore: Math.max(0, score),
  };
}

export function analyzeStlBuffer(buffer: ArrayBuffer | Uint8Array | Buffer): StlAnalysis {
  return analyzeStlTriangles(parseBinaryStl(buffer));
}

export function generatePrintSuggestions(analysis: StlAnalysis): PrintSuggestion {
  const { features, boundingBox, volumeMm3 } = analysis;

  let orientation: PrintSuggestion["orientation"];
  if (features.hasFlatBase) {
    orientation = {
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      reason: "Bază plată detectată — orientare naturală",
      supportReductionPercent: 0,
    };
  } else {
    const faces = [
      { area: boundingBox.x * boundingBox.y, rotationX: 0, rotationY: 0, rotationZ: 0 },
      { area: boundingBox.x * boundingBox.z, rotationX: 90, rotationY: 0, rotationZ: 0 },
      { area: boundingBox.y * boundingBox.z, rotationX: 0, rotationY: 90, rotationZ: 0 },
    ];
    const best = faces.reduce((a, b) => (a.area <= b.area ? a : b));
    orientation = {
      rotationX: best.rotationX,
      rotationY: best.rotationY,
      rotationZ: best.rotationZ,
      reason: `Rotit pentru bază mai mică (~${best.area.toFixed(0)} mm²) — mai puține suporturi`,
      supportReductionPercent: 30,
    };
  }

  let layerHeight: PrintSuggestion["layerHeight"];
  if (boundingBox.z < 10 || features.curvedSurfacesPercent > 50) {
    layerHeight = {
      recommended: 0.1,
      min: 0.08,
      max: 0.15,
      reason: "Detalii fine / suprafețe curbe",
    };
  } else if (boundingBox.z < 50) {
    layerHeight = {
      recommended: 0.2,
      min: 0.1,
      max: 0.3,
      reason: "Echilibru viteză / calitate",
    };
  } else {
    layerHeight = {
      recommended: 0.3,
      min: 0.2,
      max: 0.4,
      reason: "Piesă mare — prioritizare viteză",
    };
  }

  let infill: PrintSuggestion["infill"];
  if (features.hasThinWalls || features.curvedSurfacesPercent > 30) {
    infill = {
      pattern: "gyroid",
      density: 25,
      reason: "Rezistență multidirecțională, greutate redusă",
    };
  } else if (features.maxOverhangAngleDeg > 45) {
    infill = {
      pattern: "triangular",
      density: 40,
      reason: "Rigiditate mai mare pentru overhang-uri",
    };
  } else {
    infill = {
      pattern: "grid",
      density: 20,
      reason: "Standard, rapid, suficient pentru majoritatea pieselor",
    };
  }

  let supports: PrintSuggestion["supports"];
  if (!features.hasOverhangs) {
    supports = {
      needed: false,
      type: "normal",
      overhangThreshold: 45,
      reason: "Fără overhang-uri semnificative",
    };
  } else if (features.maxOverhangAngleDeg > 60) {
    supports = {
      needed: true,
      type: "tree",
      overhangThreshold: 50,
      reason: "Overhang-uri severe — tree supports (mai puțin material)",
    };
  } else {
    supports = {
      needed: true,
      type: "normal",
      overhangThreshold: 45,
      reason: "Overhang-uri moderate — suporturi standard",
    };
  }

  const layers = Math.max(1, boundingBox.z / layerHeight.recommended);
  const infillFactor = 0.5 + infill.density / 100;
  const estimatedPrintTimeMinutes = Math.round(layers * 2 * infillFactor);

  const volumeCm3 = volumeMm3 / 1000;
  const densityPla = 1.24;
  const solidMaterial = volumeCm3 * densityPla;
  const wallFactor = 0.3;
  const estimatedMaterialGrams =
    Math.round(
      (solidMaterial * wallFactor + solidMaterial * (1 - wallFactor) * (infill.density / 100)) * 10
    ) / 10;

  return {
    orientation,
    layerHeight,
    infill,
    supports,
    estimatedPrintTimeMinutes,
    estimatedMaterialGrams,
  };
}

export function analyzeStlForPrint(buffer: ArrayBuffer | Uint8Array | Buffer): {
  analysis: StlAnalysis;
  suggestions: PrintSuggestion;
} {
  const analysis = analyzeStlBuffer(buffer);
  return { analysis, suggestions: generatePrintSuggestions(analysis) };
}

/** Minimal solid cube STL (axis-aligned) for tests — sizeMm per edge. */
export function buildCubeStlBuffer(sizeMm = 10): Buffer {
  const s = sizeMm;
  const tris: Array<[Vector3, Vector3, Vector3, Vector3]> = [
    [{ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0 }, { x: s, y: 0, z: 0 }, { x: s, y: s, z: 0 }],
    [{ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0 }, { x: s, y: s, z: 0 }, { x: 0, y: s, z: 0 }],
    [{ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: s }, { x: s, y: s, z: s }, { x: s, y: 0, z: s }],
    [{ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: s }, { x: 0, y: s, z: s }, { x: s, y: s, z: s }],
    [{ x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: s, y: 0, z: 0 }, { x: s, y: 0, z: s }],
    [{ x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: s, y: 0, z: s }, { x: 0, y: 0, z: s }],
    [{ x: 0, y: 1, z: 0 }, { x: 0, y: s, z: 0 }, { x: 0, y: s, z: s }, { x: s, y: s, z: s }],
    [{ x: 0, y: 1, z: 0 }, { x: 0, y: s, z: 0 }, { x: s, y: s, z: s }, { x: s, y: s, z: 0 }],
    [{ x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: s }, { x: 0, y: s, z: s }],
    [{ x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: s, z: s }, { x: 0, y: s, z: 0 }],
    [{ x: 1, y: 0, z: 0 }, { x: s, y: 0, z: 0 }, { x: s, y: s, z: 0 }, { x: s, y: s, z: s }],
    [{ x: 1, y: 0, z: 0 }, { x: s, y: 0, z: 0 }, { x: s, y: s, z: s }, { x: s, y: 0, z: s }],
  ];

  const header = Buffer.alloc(80, 0);
  header.write("caval-cube", 0, "utf8");
  const count = Buffer.alloc(4);
  count.writeUInt32LE(tris.length, 0);
  const triBufs = tris.map(([n, a, b, c]) => {
    const tri = Buffer.alloc(50);
    tri.writeFloatLE(n.x, 0);
    tri.writeFloatLE(n.y, 4);
    tri.writeFloatLE(n.z, 8);
    tri.writeFloatLE(a.x, 12);
    tri.writeFloatLE(a.y, 16);
    tri.writeFloatLE(a.z, 20);
    tri.writeFloatLE(b.x, 24);
    tri.writeFloatLE(b.y, 28);
    tri.writeFloatLE(b.z, 32);
    tri.writeFloatLE(c.x, 36);
    tri.writeFloatLE(c.y, 40);
    tri.writeFloatLE(c.z, 44);
    return tri;
  });
  return Buffer.concat([header, count, ...triBufs]);
}
