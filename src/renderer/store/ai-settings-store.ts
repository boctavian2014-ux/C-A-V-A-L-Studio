import { create } from "zustand";

import {
  DEFAULT_AI_SETTINGS,
  type AiSettings,
} from "../../shared/ai-settings-contract";

interface AiSettingsStore {
  settings: AiSettings;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  update: (partial: Partial<AiSettings>) => Promise<AiSettings | null>;
  reset: () => Promise<AiSettings | null>;
}

export const useAiSettingsStore = create<AiSettingsStore>((set) => ({
  settings: {
    ...DEFAULT_AI_SETTINGS,
    toolsEnabled: { ...DEFAULT_AI_SETTINGS.toolsEnabled },
  },
  loading: false,
  error: null,

  refresh: async () => {
    const api = window.caval?.aiSettings;
    if (!api?.getSettings) return;
    set({ loading: true, error: null });
    try {
      const res = await api.getSettings();
      if (!res.ok || !res.settings) {
        set({ loading: false, error: res.error ?? "Failed to load AI settings" });
        return;
      }
      set({ settings: res.settings, loading: false, error: null });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load AI settings",
      });
    }
  },

  update: async (partial) => {
    const api = window.caval?.aiSettings;
    if (!api?.updateSettings) return null;
    set({ loading: true, error: null });
    try {
      const res = await api.updateSettings(partial);
      if (!res.ok || !res.settings) {
        set({ loading: false, error: res.error ?? "Failed to update AI settings" });
        return null;
      }
      set({ settings: res.settings, loading: false, error: null });
      return res.settings;
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to update AI settings",
      });
      return null;
    }
  },

  reset: async () => {
    const api = window.caval?.aiSettings;
    if (!api?.resetSettings) return null;
    set({ loading: true, error: null });
    try {
      const res = await api.resetSettings();
      if (!res.ok || !res.settings) {
        set({ loading: false, error: res.error ?? "Failed to reset AI settings" });
        return null;
      }
      set({ settings: res.settings, loading: false, error: null });
      return res.settings;
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to reset AI settings",
      });
      return null;
    }
  },
}));
