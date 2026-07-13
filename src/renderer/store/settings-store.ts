import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AppSettings {
  theme: 'dark' | 'light';
  language: 'ro' | 'en';
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
}

export type SettingsSection =
  | 'general'
  | 'editor'
  | 'ai'
  | 'arena'
  | 'cad-cloud'
  | 'shortcuts'
  | 'about';

const LEGACY_SECTIONS = new Set([
  'app',
  'asset-manager',
  'context-bridge',
  'export',
  'safety',
  'prompt-library',
]);

export interface SettingsState {
  app: AppSettings;
  activeSection: SettingsSection;
  setActiveSection: (s: SettingsSection) => void;
  updateApp: (patch: Partial<AppSettings>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      app: {
        theme: 'dark',
        language: 'ro',
        fontSize: 14,
        tabSize: 2,
        wordWrap: false,
        minimap: true,
      },
      activeSection: 'general',
      setActiveSection: (s) => set({ activeSection: s }),
      updateApp: (patch) => set((state) => ({
        app: { ...state.app, ...patch },
      })),
    }),
    {
      name: 'caval-settings',
      partialize: (state) => ({
        app: state.app,
        activeSection: state.activeSection,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const section = state.activeSection as string;
        if (LEGACY_SECTIONS.has(section)) {
          state.activeSection = section === 'editor' ? 'editor' : 'general';
        }
      },
    }
  )
);
