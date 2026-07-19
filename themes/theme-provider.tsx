import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type CavalThemeMode = "dark" | "light";

export interface CavalThemeColors {
  bg: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
}

export interface CavalTheme {
  mode: CavalThemeMode;
  colors: CavalThemeColors;
}

interface CavalThemeContextValue {
  mode: CavalThemeMode;
  theme: CavalTheme;
  setMode: (mode: CavalThemeMode) => void;
}

const DARK_THEME: CavalTheme = {
  mode: "dark",
  colors: {
    bg: "#0E0E0F",
    surface: "#111214",
    surfaceRaised: "#181A1F",
    border: "#24262B",
    text: "#F5F7FA",
    textMuted: "#8A95A6",
    accent: "#00E0FF"
  }
};

const LIGHT_THEME: CavalTheme = {
  mode: "light",
  colors: {
    bg: "#F4F6FA",
    surface: "#FFFFFF",
    surfaceRaised: "#EEF1F6",
    border: "#D7DEE8",
    text: "#0E0E0F",
    textMuted: "#5C6370",
    accent: "#007A8C"
  }
};

const CavalThemeContext = createContext<CavalThemeContextValue>({
  mode: "dark",
  theme: DARK_THEME,
  setMode: () => undefined
});

const hasDom = typeof window !== "undefined" && typeof document !== "undefined";

const THEME_CSS_KEYS = [
  "--caval-bg",
  "--caval-surface",
  "--caval-surface-raised",
  "--caval-border",
  "--caval-text",
  "--caval-text-muted",
  "--caval-accent",
  "--caval-accent-glow",
  "--caval-accent-ring",
  "--caval-success",
  "--caval-error",
] as const;

const applyVars = (theme: CavalTheme): void => {
  if (!hasDom) return;
  const root = document.documentElement;
  root.style.setProperty("--caval-bg", theme.colors.bg);
  root.style.setProperty("--caval-surface", theme.colors.surface);
  root.style.setProperty("--caval-surface-raised", theme.colors.surfaceRaised);
  root.style.setProperty("--caval-border", theme.colors.border);
  root.style.setProperty("--caval-text", theme.colors.text);
  root.style.setProperty("--caval-text-muted", theme.colors.textMuted);
  root.style.setProperty("--caval-accent", theme.colors.accent);
  root.style.setProperty("--caval-accent-glow", `${theme.colors.accent}1F`);
  root.style.setProperty("--caval-accent-ring", `${theme.colors.accent}40`);
  root.style.setProperty("--caval-success", "#2FBF71");
  root.style.setProperty("--caval-error", "#F47067");
};

const clearVars = (): void => {
  if (!hasDom) return;
  const root = document.documentElement;
  THEME_CSS_KEYS.forEach((key) => root.style.removeProperty(key));
};

export const CavalThemeProvider = ({
  children,
  defaultMode = "dark"
}: {
  children: React.ReactNode;
  defaultMode?: CavalThemeMode;
}) => {
  const readStoredMode = (): CavalThemeMode => {
    if (!hasDom) return defaultMode;
    try {
      const raw = localStorage.getItem("caval-settings");
      if (!raw) return defaultMode;
      const parsed = JSON.parse(raw) as { state?: { app?: { theme?: string } } };
      const theme = parsed?.state?.app?.theme;
      return theme === "light" ? "light" : "dark";
    } catch {
      return defaultMode;
    }
  };

  const [mode, setMode] = useState<CavalThemeMode>(readStoredMode);
  const theme = mode === "light" ? LIGHT_THEME : DARK_THEME;

  useEffect(() => {
    applyVars(theme);
    return () => clearVars();
  }, [theme]);

  const value = useMemo(() => ({ mode, theme, setMode }), [mode, theme]);

  return <CavalThemeContext.Provider value={value}>{children}</CavalThemeContext.Provider>;
};

export const useCavalTheme = (): CavalThemeContextValue => useContext(CavalThemeContext);
