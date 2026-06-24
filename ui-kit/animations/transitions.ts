export const transitions = {
  fast: "120ms cubic-bezier(0.2, 0, 0, 1)",
  normal: "180ms cubic-bezier(0.2, 0, 0, 1)",
  slow: "260ms cubic-bezier(0.2, 0, 0, 1)",
  fade: {
    from: { opacity: 0 },
    to: { opacity: 1 }
  },
  slideUp: {
    from: { opacity: 0, transform: "translateY(8px)" },
    to: { opacity: 1, transform: "translateY(0)" }
  },
  slideIn: {
    from: { opacity: 0, transform: "translateX(-8px)" },
    to: { opacity: 1, transform: "translateX(0)" }
  },
  scale: {
    from: { opacity: 0, transform: "scale(0.98)" },
    to: { opacity: 1, transform: "scale(1)" }
  }
} as const;
