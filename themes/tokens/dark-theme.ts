import { semanticColors } from "../tokens/colors";
import { radii } from "../tokens/radii";
import { shadows } from "../tokens/shadows";
import { spacing } from "../tokens/spacing";
import { typography } from "../tokens/typography";
import { zIndex } from "../tokens/z-index";

export const darkTheme = {
  name: "caval-dark",
  mode: "dark",
  colors: semanticColors,
  typography,
  spacing,
  radii,
  shadows,
  zIndex,
  cssVariables: {
    "--caval-bg": semanticColors.background,
    "--caval-surface": semanticColors.surface,
    "--caval-surface-raised": semanticColors.surfaceRaised,
    "--caval-text": semanticColors.text,
    "--caval-text-muted": semanticColors.textMuted,
    "--caval-border": semanticColors.border,
    "--caval-accent": semanticColors.accent,
    "--caval-accent-glow": semanticColors.accentGlow
  }
} as const;
