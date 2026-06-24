/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./components/ui/**/*.{ts,tsx}",
    "./components/ui/logicflow/**/*.{ts,tsx}",
    "./mobile/**/*.{ts,tsx}",
    "./ui-kit/**/*.{ts,tsx}",
    "./src/renderer/**/*.{ts,html}"
  ],
  theme: {
    extend: {
      colors: {
        pt: {
          deep: "var(--pt-deep-blue)",
          mid: "var(--pt-mid-blue)",
          cyan: "var(--pt-cyan)",
          electric: "var(--pt-electric-blue)",
          purple: "var(--pt-purple)",
          gold: "var(--pt-gold)"
        }
      },
      boxShadow: {
        "pt-cyan": "var(--pt-shadow-cyan)",
        "pt-strong": "var(--pt-shadow-strong)"
      },
      borderRadius: {
        pt: "var(--pt-radius-md)",
        "pt-lg": "var(--pt-radius-lg)"
      },
      textColor: {
        "pt-primary": "var(--pt-text-primary)",
        "pt-secondary": "var(--pt-text-secondary)",
        "pt-muted": "var(--pt-text-muted)"
      },
      backgroundColor: {
        "pt-surface-1": "var(--pt-surface-1)",
        "pt-surface-2": "var(--pt-surface-2)",
        "pt-surface-3": "var(--pt-surface-3)"
      },
      borderColor: {
        pt: "var(--pt-border)",
        "pt-strong": "var(--pt-border-strong)"
      }
    }
  },
  plugins: []
};
