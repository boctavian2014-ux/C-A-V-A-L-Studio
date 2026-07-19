import { lightSemanticColors } from "./colors";
import { radii } from "./radii";
import { shadows } from "./shadows";
import { spacing } from "./spacing";
import { typography } from "./typography";
import { zIndex } from "./z-index";

// cssVariables are DERIVED from lightSemanticColors so the CSS custom properties
// can never drift away from the token values (previously they were duplicated).
const colors = lightSemanticColors;

export const lightTheme = {
  name: "caval-light",
  mode: "light",
  colors,
  typography,
  spacing,
  radii,
  shadows,
  zIndex,
  cssVariables: {
    "--caval-bg": colors.background,
    "--caval-surface": colors.surface,
    "--caval-surface-raised": colors.surfaceRaised,
    "--caval-text": colors.text,
    "--caval-text-muted": colors.textMuted,
    "--caval-border": colors.border,
    "--caval-accent": colors.accent,
    "--caval-accent-glow": colors.accentGlow
  }
} as const;
