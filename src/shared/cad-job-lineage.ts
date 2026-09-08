import {
  estimateProviderCost,
  type CadProviderId,
  type ProviderCostEstimate,
} from "./cad-zoo-contract";

/** Stable Chromium-friendly prefix — JSON payload, not `[object Object]`. */
export const CAD_JOB_LOG_PREFIX = "[cad-job]";

export type CadModeHint = "openscad" | "mesh" | "library" | "zoo" | string | null | undefined;

/**
 * Map planner pipeline / generationMode to the badge provider id.
 * `library` is the OpenSCAD toy-template path.
 */
export function cadProviderFromCadMode(mode: CadModeHint): CadProviderId {
  if (mode === "zoo") return "zoo";
  if (mode === "mesh") return "trellis";
  return "openscad";
}

/**
 * Infer what actually produced the STL.
 * Zoo/mesh leave no SCAD; OpenSCAD (including zoo→openscad fallback) writes SCAD.
 * `pipeline_fallback` log message wins when present (`zoo failed → openscad`).
 */
export function inferCadActualProvider(input: {
  resolvedProvider: CadProviderId;
  hasScad: boolean;
  hasStl: boolean;
  fallbackMessage?: string | null;
}): CadProviderId {
  const msg = input.fallbackMessage ?? "";
  if (/→\s*openscad/i.test(msg)) return "openscad";
  if (/→\s*zoo/i.test(msg)) return "zoo";
  if (/→\s*mesh/i.test(msg)) return "trellis";
  if (input.hasStl && input.hasScad) return "openscad";
  if (input.hasStl && !input.hasScad) {
    return input.resolvedProvider === "openscad" ? "zoo" : input.resolvedProvider;
  }
  return input.resolvedProvider;
}

/** Job result wins over the composer prompt guess (RC #4 UI-stale). */
export function resolveCadBadgeProvider(input: {
  suggestedProvider: CadProviderId;
  resolvedProvider: CadProviderId | null;
  actualProvider: CadProviderId | null;
}): CadProviderId {
  return input.actualProvider ?? input.resolvedProvider ?? input.suggestedProvider;
}

export function resolveCadBadgeCost(input: {
  provider: CadProviderId;
  jobCost: ProviderCostEstimate | null;
  prompt: string;
}): ProviderCostEstimate | null {
  if (input.jobCost && input.jobCost.provider === input.provider) return input.jobCost;
  if (input.provider === "zoo") {
    const source = input.prompt.trim() || "mechanical part";
    return estimateProviderCost("zoo", source);
  }
  if (input.prompt.trim().length > 10) return estimateProviderCost(input.provider, input.prompt);
  return null;
}

export function logCadJob(event: string, payload: Record<string, unknown>): void {
  console.info(`${CAD_JOB_LOG_PREFIX} ${JSON.stringify({ event, ...payload })}`);
}
