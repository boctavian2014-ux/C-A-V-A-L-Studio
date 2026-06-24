export const flex = {
  row: "display:flex;flex-direction:row;",
  column: "display:flex;flex-direction:column;",
  center: "display:flex;align-items:center;justify-content:center;",
  between: "display:flex;align-items:center;justify-content:space-between;",
  inlineCenter: "display:inline-flex;align-items:center;justify-content:center;"
} as const;

export const flexGap = (gap: string): string => `gap:${gap};`;
