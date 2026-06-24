import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { darkTheme } from "./dark-theme";
import { lightTheme } from "./light-theme";

export type CavalThemeMode = "dark" | "light" | "system";
export type CavalTheme = typeof darkTheme | typeof lightTheme;

export interface ThemeContextValue {
  mode: CavalThemeMode;
  resolvedMode: "dark" | "light";
  theme: CavalTheme;
  setMode: (mode: CavalThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const CavalThemeProvider = ({ children, defaultMode = "system" }: { children: ReactNode; defaultMode?: CavalThemeMode }) => {
  const [mode, setMode] = useState<CavalThemeMode>(defaultMode);
  const [systemMode, setSystemMode] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!media) {
      return;
    }

    const update = () => setSystemMode(media.matches ? "light" : "dark");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const resolvedMode = mode === "system" ? systemMode : mode;
    return {
      mode,
      resolvedMode,
      theme: resolvedMode === "dark" ? darkTheme : lightTheme,
      setMode
    };
  }, [mode, systemMode]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.cavalTheme = value.resolvedMode;
    Object.entries(value.theme.cssVariables).forEach(([key, token]) => root.style.setProperty(key, token));
  }, [value]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useCavalTheme = (): ThemeContextValue => {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useCavalTheme must be used inside CavalThemeProvider.");
  }

  return value;
};
