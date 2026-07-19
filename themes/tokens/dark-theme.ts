import { semanticColors } from "./colors";
import { radii } from "./radii";
import { shadows } from "./shadows";
import { spacing } from "./spacing";
import { typography } from "./typography";
import { zIndex } from "./z-index";

// cssVariables are DERIVED from semanticColors so the CSS custom properties
// stay in lockstep with the token values (no more manually duplicated strings).
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
