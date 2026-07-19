export const colors = {
  graphiteBlack: "#0E0E0F",
  graphiteBlackElevated: "#141416",
  deepBlue: "#0A1A2F",
  deepBlueMuted: "#132A55",
  cyanPulse: "#00E0FF",
  cyanPulseSoft: "#7CEBFF",
  // Single source of truth for the cyan glow color.
  // Previously two different cyans coexisted: colors.cyanGlow used rgb(0,224,255)
  // while shadows.ts / light-theme.ts used rgb(23,215,255). Unified on cyanPulse (#00E0FF).
  cyanGlow: "rgba(0, 224, 255, 0.42)",
  cyanGlowSoft: "rgba(0, 224, 255, 0.26)",
  cyanGlowFocus: "rgba(0, 224, 255, 0.2)",
  softWhite: "#F5F7FA",
  softWhiteMuted: "#D7DEE8",
  carpathianGold: "#D4A857",
  forestGreen: "#2FBF71",
  mountainGrey: "#8A95A6",
  mountainGreyDark: "#3B4658",
  dangerRed: "#EF4444",
  warningAmber: "#F59E0B",
  transparent: "transparent"
} as const;

// Shared semantic palette for the DARK theme (the app default).
export const semanticColors = {
  background: colors.graphiteBlack,
  surface: colors.graphiteBlackElevated,
  surfaceRaised: "#101826",
  border: "rgba(138, 149, 166, 0.24)",
  text: colors.softWhite,
  textMuted: colors.mountainGrey,
  accent: colors.cyanPulse,
  accentGlow: colors.cyanGlow,
  success: colors.forestGreen,
  warning: colors.warningAmber,
  error: colors.dangerRed,
  premium: colors.carpathianGold
} as const;

// Shared semantic palette for the LIGHT theme.
// Extracted here so light-theme.ts no longer hardcodes duplicate hex/rgba strings.
export const lightSemanticColors = {
  background: "#F6F8FB",
  surface: "#FFFFFF",
  surfaceRaised: "#EEF4FA",
  border: "rgba(59, 70, 88, 0.18)",
  text: "#101826",
  textMuted: colors.mountainGreyDark,
  accent: colors.cyanPulse,
  accentGlow: colors.cyanGlowSoft,
  success: colors.forestGreen,
  warning: colors.warningAmber,
  error: colors.dangerRed,
  premium: colors.carpathianGold
} as const;

export type CavalColorToken = keyof typeof colors;
export type CavalSemanticColors = typeof semanticColors;
