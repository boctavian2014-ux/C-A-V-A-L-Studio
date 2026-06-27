import { colors } from "../tokens/colors";
import { radii } from "../tokens/radii";
import { shadows } from "../tokens/shadows";
import { spacing } from "../tokens/spacing";
import { typography } from "../tokens/typography";
import { zIndex } from "../tokens/z-index";

export const lightTheme = {
  name: "caval-light",
  mode: "light",
  colors: {
    background: "#F6F8FB",
    surface: "#FFFFFF",
    surfaceRaised: "#EEF4FA",
    border: "rgba(59, 70, 88, 0.18)",
    text: "#101826",
    textMuted: colors.mountainGreyDark,
    accent: colors.cyanPulse,
    accentGlow: "rgba(23, 215, 255, 0.28)",
    success: colors.forestGreen,
    warning: colors.warningAmber,
    error: colors.dangerRed,
    premium: colors.carpathianGold
  },
  typography,
  spacing,
  radii,
  shadows,
  zIndex,
  cssVariables: {
    "--caval-bg": "#F6F8FB",
    "--caval-surface": "#FFFFFF",
    "--caval-surface-raised": "#EEF4FA",
    "--caval-text": "#101826",
    "--caval-text-muted": colors.mountainGreyDark,
    "--caval-border": "rgba(59, 70, 88, 0.18)",
    "--caval-accent": colors.cyanPulse,
    "--caval-accent-glow": "rgba(23, 215, 255, 0.28)"
  }
} as const;
