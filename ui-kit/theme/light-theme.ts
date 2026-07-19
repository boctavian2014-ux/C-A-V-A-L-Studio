import { lightSemanticColors } from "../tokens/colors";
import { radii } from "../tokens/radii";
import { shadows } from "../tokens/shadows";
import { spacing } from "../tokens/spacing";
import { typography } from "../tokens/typography";
import { zIndex } from "../tokens/z-index";

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
