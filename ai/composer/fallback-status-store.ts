import { create } from "zustand";

export interface FallbackStatusSnapshot {
  activeProvider: string | null;
  fallbackFrom: string | null;
  agenticBlockedProvider: string | null;
  agenticBlockedUntil: number | null;
}

interface FallbackStatusStore extends FallbackStatusSnapshot {
  noteProvider: (provider: string | null, fallbackFrom?: string | null) => void;
  noteAgenticUnavailable: (provider: string, cooldownRemainingMs: number) => void;
  clearAgenticBlock: () => void;
  resetRoute: () => void;
}

export function formatProviderLabel(providerId: string | null | undefined): string {
  if (!providerId) return "";
  const map: Record<string, string> = {
    nvidia: "NVIDIA",
    ollama: "Ollama",
    open_source: "Ollama",
    openrouter: "OpenRouter",
    openai: "OpenAI",
    anthropic: "Anthropic",
    gemini: "Gemini",
    custom: "Custom",
  };
  return map[providerId] ?? providerId;
}

export function formatFallbackBadge(from: string | null, to: string | null): string | null {
  if (!from || !to || from === to) return null;
  return `${formatProviderLabel(from)} -> ${formatProviderLabel(to)}`;
}

export const useFallbackStatusStore = create<FallbackStatusStore>((set) => ({
  activeProvider: null,
  fallbackFrom: null,
  agenticBlockedProvider: null,
  agenticBlockedUntil: null,
  noteProvider: (provider, fallbackFrom = null) =>
    set({
      activeProvider: provider,
      fallbackFrom: fallbackFrom ?? null,
      agenticBlockedProvider: null,
      agenticBlockedUntil: null,
    }),
  noteAgenticUnavailable: (provider, cooldownRemainingMs) =>
    set({
      agenticBlockedProvider: provider,
      agenticBlockedUntil: Date.now() + Math.max(0, cooldownRemainingMs),
      activeProvider: provider,
    }),
  clearAgenticBlock: () => set({ agenticBlockedProvider: null, agenticBlockedUntil: null }),
  resetRoute: () =>
    set({
      activeProvider: null,
      fallbackFrom: null,
      agenticBlockedProvider: null,
      agenticBlockedUntil: null,
    }),
}));
