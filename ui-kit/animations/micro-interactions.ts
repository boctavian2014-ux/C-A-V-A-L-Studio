import { shadows } from "../tokens/shadows";

export const microInteractions = {
  hoverLift: {
    transform: "translateY(-1px)",
    boxShadow: shadows.md
  },
  press: {
    transform: "translateY(0) scale(0.99)"
  },
  focusRing: {
    outline: "2px solid var(--caval-accent)",
    outlineOffset: "2px",
    boxShadow: shadows.cyanGlow
  },
  aiGlowPulse: {
    animationName: "caval-ai-glow-pulse",
    animationDuration: "1800ms",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite"
  },
  keyframes: `
    @keyframes caval-ai-glow-pulse {
      0%, 100% { box-shadow: 0 0 0 rgba(23, 215, 255, 0); }
      50% { box-shadow: 0 0 28px rgba(23, 215, 255, 0.32); }
    }
  `
} as const;
