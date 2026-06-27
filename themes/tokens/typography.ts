export const typography = {
  fontFamily: {
    ui: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    heading: "Sora, Inter, ui-sans-serif, system-ui, sans-serif",
    mono: "JetBrains Mono, SFMono-Regular, Consolas, Liberation Mono, monospace"
  },
  size: {
    xs: "12px",
    sm: "13px",
    md: "14px",
    lg: "16px",
    xl: "20px",
    "2xl": "28px",
    "3xl": "40px"
  },
  lineHeight: {
    tight: "1.1",
    normal: "1.45",
    relaxed: "1.65"
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700
  },
  letterSpacing: {
    dense: "-0.02em",
    normal: "0",
    wide: "0.08em"
  }
} as const;
