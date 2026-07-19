// Unified cyan (rgb 0,224,255) so glows match colors.cyanPulse / semanticColors.accent.
export const shadows = {
  none: "none",
  sm: "0 1px 2px rgba(0, 0, 0, 0.22)",
  md: "0 12px 32px rgba(0, 0, 0, 0.28)",
  lg: "0 24px 80px rgba(0, 0, 0, 0.38)",
  cyanGlow: "0 0 0 1px rgba(0, 224, 255, 0.26), 0 0 32px rgba(0, 224, 255, 0.2)",
  goldGlow: "0 0 0 1px rgba(212, 168, 87, 0.22), 0 16px 44px rgba(212, 168, 87, 0.14)"
} as const;
