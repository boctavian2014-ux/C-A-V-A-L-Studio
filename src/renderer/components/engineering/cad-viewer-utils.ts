export interface StlDimensions {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  label: string;
}

export interface Box3Like {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

function roundMm(value: number): number {
  return Math.round(value * 10) / 10;
}

export function dimensionsFromBox3(box: Box3Like): StlDimensions {
  const widthMm = roundMm(box.max.x - box.min.x);
  const heightMm = roundMm(box.max.y - box.min.y);
  const depthMm = roundMm(box.max.z - box.min.z);
  return {
    widthMm,
    heightMm,
    depthMm,
    label: `${widthMm} × ${heightMm} × ${depthMm} mm`,
  };
}
