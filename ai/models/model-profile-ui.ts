// ──────────────────────────────────────────────
//  Model profile UI helpers — capability chips
// ──────────────────────────────────────────────

import { modelProfiles } from '../model-profiles';
import type { CatalogEntry } from './model-catalog';

export interface ModelProfileSummary {
  chips: string[];
  description: string;
  contextWindow?: number;
}

const SPEC_LABELS: Record<string, string> = {
  coding: 'Coding',
  reasoning: 'Reasoning',
  debugging: 'Debug',
  tool_use: 'Tools',
  autocomplete: 'Autocomplete',
  planning: 'Planning',
};

const SPEED_LABELS: Record<string, string> = {
  ultra_fast: 'Ultra fast',
  fast: 'Fast',
  balanced: 'Balanced',
  slow: 'Slow',
};

const COST_LABELS: Record<string, string> = {
  local: 'Local',
  low: 'Low cost',
  medium: 'Medium',
  high: 'High',
  premium: 'Premium',
};

function formatContextWindow(tokens: number): string | null {
  if (!tokens || tokens <= 0) return null;
  if (tokens >= 1_000_000) return `${Math.round(tokens / 1_000_000)}M ctx`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k ctx`;
  return `${tokens} ctx`;
}

export function getModelProfileSummary(
  modelId: string,
  catalogEntry?: CatalogEntry | null
): ModelProfileSummary {
  const profile = modelProfiles.find(
    (p) => p.id === modelId || p.providerModelId === modelId
  );

  const chips: string[] = [];
  if (profile) {
    for (const spec of profile.specialization.slice(0, 3)) {
      const label = SPEC_LABELS[spec] ?? spec;
      if (!chips.includes(label)) chips.push(label);
    }
    if (profile.speed) {
      const speed = SPEED_LABELS[profile.speed] ?? profile.speed;
      if (!chips.includes(speed)) chips.push(speed);
    }
    if (profile.supportsToolCalling && !chips.includes('Tools')) {
      chips.push('Tools');
    }
    const ctx = formatContextWindow(profile.contextWindow);
    if (ctx) chips.push(ctx);

    return {
      chips,
      description:
        catalogEntry?.description ??
        `${profile.displayName ?? profile.name} — ${COST_LABELS[profile.costEstimate] ?? profile.costEstimate}`,
      contextWindow: profile.contextWindow,
    };
  }

  if (catalogEntry) {
    const ctx = formatContextWindow(catalogEntry.contextWindow);
    if (ctx) chips.push(ctx);
    if (catalogEntry.tier === 'free') chips.push('Free');
    if (catalogEntry.tier === 'paid') chips.push('Paid');
    if (catalogEntry.source === 'byok') chips.push('BYOK');
    return {
      chips,
      description: catalogEntry.description ?? catalogEntry.label,
      contextWindow: catalogEntry.contextWindow || undefined,
    };
  }

  if (modelId.startsWith('caval-auto/')) {
    const tier = modelId.replace('caval-auto/', '');
    return {
      chips: ['Auto route', tier],
      description: 'Routing automat către cel mai potrivit model disponibil',
    };
  }

  return { chips: [], description: modelId };
}

export function formatProfileChips(chips: string[]): string {
  return chips.slice(0, 5).join(' · ');
}
