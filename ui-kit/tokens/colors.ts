export const colors = {
  graphiteBlack: "#0E0E0F",
  graphiteBlackElevated: "#141416",
  deepBlue: "#0A1A2F",
  deepBlueMuted: "#132A55",
  cyanPulse: "#00E0FF",
  cyanPulseSoft: "#7CEBFF",
  cyanGlow: "rgba(0, 224, 255, 0.42)",
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

export type CavalColorToken = keyof typeof colors;
