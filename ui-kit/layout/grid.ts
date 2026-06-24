export const grid = {
  columns: 12,
  gap: "16px",
  maxWidth: "1440px",
  template: "repeat(12, minmax(0, 1fr))"
} as const;

export const gridColumn = (span: number, start?: number): string =>
  start ? `${start} / span ${span}` : `span ${span}`;
