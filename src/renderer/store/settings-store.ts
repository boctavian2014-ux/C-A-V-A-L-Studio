import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ──────────────────────────────────────────────
//  Settings Store — CAVALLO Studio
//  Persisted în localStorage (toate setările)
// ──────────────────────────────────────────────

// ── Asset Presets ─────────────────────────────

export interface ImagePreset {
  id: string;
  label: string;
  width: number;
  height: number;
  category: 'app' | 'marketing' | 'social' | 'custom';
  description: string;
  enabled: boolean; // bifat pentru export automat
}

export const DEFAULT_PRESETS: ImagePreset[] = [
  // App
  { id: 'app_icon',        label: 'App Icon',          width: 1024, height: 1024, category: 'app',       description: 'iOS / Android app icon',              enabled: false },
  { id: 'app_icon_small',  label: 'App Icon Small',    width: 512,  height: 512,  category: 'app',       description: 'Google Play feature graphic',         enabled: false },
  { id: 'splash',          label: 'Splash Screen',     width: 2732, height: 2732, category: 'app',       description: 'Universal splash (iPad max)',          enabled: false },
  { id: 'splash_android',  label: 'Splash Android',    width: 1920, height: 1080, category: 'app',       description: 'Android landscape splash',            enabled: false },
  // Marketing
  { id: 'banner_hero',     label: 'Hero Banner',       width: 1920, height: 600,  category: 'marketing', description: 'Website hero / landing page',         enabled: false },
  { id: 'banner_store',    label: 'Store Banner',      width: 1024, height: 500,  category: 'marketing', description: 'Google Play / App Store feature',     enabled: false },
  { id: 'og_image',        label: 'OG Image',          width: 1200, height: 630,  category: 'marketing', description: 'Open Graph / social preview card',    enabled: false },
  // Social
  { id: 'social_square',   label: 'Social Square',     width: 1080, height: 1080, category: 'social',    description: 'Instagram / Facebook post',           enabled: false },
  { id: 'social_story',    label: 'Social Story',      width: 1080, height: 1920, category: 'social',    description: 'Instagram / TikTok story',            enabled: false },
  { id: 'twitter_banner',  label: 'Twitter Banner',    width: 1500, height: 500,  category: 'social',    description: 'Twitter / X header image',            enabled: false },
];

// ── AI Context Bridge ─────────────────────────

export interface ContextBridgeSettings {
  enabled: boolean;
  analyzeColors: boolean;       // citește theme.ts / colors.ts
  analyzeFonts: boolean;        // citește typography.ts
  analyzeProjectName: boolean;  // include numele proiectului în prompt
  customInstructions: string;   // instrucțiuni custom adăugate la fiecare prompt
  detectedColors: string[];     // cache culori detectate (populated runtime)
  detectedFonts: string[];      // cache fonturi detectate
  lastScanPath: string | null;  // ultimul proiect scanat
}

// ── Safety & Credits ──────────────────────────

export interface SafetySettings {
  showUsageMeter: boolean;
  maxGenerationsPerSession: number; // 0 = nelimitat
  requireTransparentBg: boolean;    // adaugă "transparent background" la prompt
  addDarkModeNote: boolean;         // adaugă "works well on dark and light backgrounds"
  safeMode: boolean;                // adaugă safety prefix la prompt
}

// ── Export Settings ───────────────────────────

export interface ExportSettings {
  autoExportEnabled: boolean;
  autoExportPath: string;           // ex: './assets/generated/'
  exportFormat: 'png' | 'webp' | 'jpg';
  createSubfolders: boolean;        // organizează pe categorii: icons/, banners/ etc.
  addTimestamp: boolean;
  addPresetSuffix: boolean;         // ex: icon_1024x1024.png
}

// ── App Settings ──────────────────────────────

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  language: 'ro' | 'en';
  aiProvider: 'openai' | 'anthropic' | 'google' | 'ollama';
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  autoSave: boolean;
  autoSaveDelay: number; // ms
}

// ── Root state ────────────────────────────────

export interface SettingsState {
  // Secțiuni
  presets: ImagePreset[];
  contextBridge: ContextBridgeSettings;
  safety: SafetySettings;
  exportSettings: ExportSettings;
  app: AppSettings;

  // UI
  activeSection: SettingsSection;
  setActiveSection: (s: SettingsSection) => void;

  // Presets
  togglePreset:    (id: string) => void;
  addCustomPreset: (preset: Omit<ImagePreset, 'id' | 'category' | 'enabled'>) => void;
  removePreset:    (id: string) => void;

  // Context Bridge
  updateContextBridge: (patch: Partial<ContextBridgeSettings>) => void;
  setDetectedColors:   (colors: string[]) => void;
  setDetectedFonts:    (fonts: string[]) => void;

  // Safety
  updateSafety: (patch: Partial<SafetySettings>) => void;

  // Export
  updateExport: (patch: Partial<ExportSettings>) => void;

  // App
  updateApp: (patch: Partial<AppSettings>) => void;

  // Runtime: generări în sesiunea curentă
  sessionGenerations: number;
  incrementGenerations: () => void;
  resetSessionGenerations: () => void;
}

export type SettingsSection =
  | 'app'
  | 'editor'
  | 'asset-manager'
  | 'context-bridge'
  | 'cad-cloud'
  | 'safety'
  | 'export'
  | 'shortcuts'
  | 'prompt-library'
  | 'about';

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // ── Valori implicite ──
      presets: DEFAULT_PRESETS,

      contextBridge: {
        enabled: false,
        analyzeColors: true,
        analyzeFonts: false,
        analyzeProjectName: true,
        customInstructions: '',
        detectedColors: [],
        detectedFonts: [],
        lastScanPath: null,
      },

      safety: {
        showUsageMeter: true,
        maxGenerationsPerSession: 0,
        requireTransparentBg: false,
        addDarkModeNote: false,
        safeMode: false,
      },

      exportSettings: {
        autoExportEnabled: false,
        autoExportPath: './assets/generated/',
        exportFormat: 'png',
        createSubfolders: true,
        addTimestamp: true,
        addPresetSuffix: true,
      },

      app: {
        theme: 'dark',
        language: 'ro',
        aiProvider: 'openai',
        fontSize: 14,
        tabSize: 2,
        wordWrap: false,
        minimap: true,
        autoSave: true,
        autoSaveDelay: 1000,
      },

      activeSection: 'editor',
      sessionGenerations: 0,

      // ── Actions ──
      setActiveSection: (s) => set({ activeSection: s }),

      togglePreset: (id) => set((state) => ({
        presets: state.presets.map((p) =>
          p.id === id ? { ...p, enabled: !p.enabled } : p
        ),
      })),

      addCustomPreset: (preset) => set((state) => ({
        presets: [...state.presets, {
          ...preset,
          id: `custom_${Date.now()}`,
          category: 'custom' as const,
          enabled: true,
        }],
      })),

      removePreset: (id) => set((state) => ({
        presets: state.presets.filter((p) => p.id !== id),
      })),

      updateContextBridge: (patch) => set((state) => ({
        contextBridge: { ...state.contextBridge, ...patch },
      })),

      setDetectedColors: (colors) => set((state) => ({
        contextBridge: { ...state.contextBridge, detectedColors: colors },
      })),

      setDetectedFonts: (fonts) => set((state) => ({
        contextBridge: { ...state.contextBridge, detectedFonts: fonts },
      })),

      updateSafety: (patch) => set((state) => ({
        safety: { ...state.safety, ...patch },
      })),

      updateExport: (patch) => set((state) => ({
        exportSettings: { ...state.exportSettings, ...patch },
      })),

      updateApp: (patch) => set((state) => ({
        app: { ...state.app, ...patch },
      })),

      incrementGenerations: () => set((state) => ({
        sessionGenerations: state.sessionGenerations + 1,
      })),

      resetSessionGenerations: () => set({ sessionGenerations: 0 }),
    }),
    {
      name: 'caval-settings',
      // Nu persistăm datele runtime
      partialize: (state) => ({
        presets:         state.presets,
        contextBridge:   {
          ...state.contextBridge,
          detectedColors: [], // nu persista cache-ul de culori
          detectedFonts:  [],
        },
        safety:          state.safety,
        exportSettings:  state.exportSettings,
        app:             state.app,
        activeSection:   state.activeSection,
      }),
    }
  )
);
