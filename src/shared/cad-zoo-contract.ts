/**
 * Shared Zoo (KittyCAD) text-to-CAD contract + print settings.
 * Live API: POST /ai/text-to-cad/{output_format}, then GET /ai/text-to-cad/{id} until completed.
 * Pricing note: ~$0.0083/sec with $20 free/month; failed calls are not charged (safe OpenSCAD fallback).
 */

export type ZooOutputFormat = "stl" | "step" | "gltf";

export type ZooJobStatus = "queued" | "processing" | "completed" | "failed";

export type CadProviderId = "zoo" | "openscad" | "trellis" | "meshy";

export interface ZooJobRequest {
  prompt: string;
  outputFormat: ZooOutputFormat;
  /** Optional KittyCAD Language script for parametric parts (Phase 2+). */
  kcl?: string;
  /** Optional hint for UI cost estimation (not sent to Zoo API). */
  estimatedSeconds?: number;
}

export interface ZooJobOutputs {
  stl?: string;
  step?: string;
  gltf?: string;
}

export interface ZooJobResponse {
  id: string;
  status: ZooJobStatus;
  outputs?: ZooJobOutputs;
  error?: string;
  createdAt: string;
  completedAt?: string;
  /** Optional billing fields when the API returns them. */
  estimatedCostUsd?: number;
  actualSeconds?: number;
}

export interface ProviderCostEstimate {
  provider: CadProviderId;
  estimatedCostUsd: number;
  confidence: "high" | "medium" | "low";
  notes?: string;
}

/** Zoo list price used for UI estimates only. */
export const ZOO_USD_PER_SECOND = 0.0083;

const TOY_LIBRARY_RE =
  /(elicopter|helicopter|\bheli\b|mașin[aăi]|masina|toy\s*car|ferrari|porsche|vehicle|camion)/iu;
const MECHANICAL_RE =
  /(bracket|mount|suport|prindere|gear|angrenaj|enclosure|carcas|clamp|ghidon|m[23458]\b|mm\b|pcb|esp32|iot|parametric|piuliț|nut\b|bolt)/iu;
const FREEFORM_RE =
  /(figurin|sculptur|animal|insect|fluture|dragon|organic|character|personaj|ciocan|hammer)/iu;

/**
 * Idle-composer hint only. Live badges must use the CAD job's actual/resolved
 * provider (`cad-job-lineage`); empty prompt defaults to OpenSCAD.
 */
export function suggestCadProviderFromPrompt(prompt: string): CadProviderId {
  const t = prompt.trim();
  if (!t) return "openscad";
  if (TOY_LIBRARY_RE.test(t)) return "openscad";
  if (MECHANICAL_RE.test(t)) return "zoo";
  if (FREEFORM_RE.test(t)) return "trellis";
  if (t.length >= 6 && !/(m[2345]\b|mm\b|parametric)/i.test(t)) return "trellis";
  return "zoo";
}

/** Zoo pricing: $0.0083/sec, $20 free/month. Failed calls are not charged. */
export function estimateZooCost(prompt: string): ProviderCostEstimate {
  const baseSeconds = 10;
  const complexityFactor = Math.min(Math.max(prompt.trim().length / 50, 0.5), 3);
  const estimatedSeconds = baseSeconds * complexityFactor;
  const cost = estimatedSeconds * ZOO_USD_PER_SECOND;
  return {
    provider: "zoo",
    estimatedCostUsd: Math.round(cost * 100) / 100,
    confidence: complexityFactor > 2 ? "low" : complexityFactor > 1 ? "medium" : "high",
    notes: `$${ZOO_USD_PER_SECOND}/sec × ~${Math.round(estimatedSeconds)}s · $20 free/mo`,
  };
}

export function estimateProviderCost(
  provider: CadProviderId,
  prompt: string
): ProviderCostEstimate {
  if (provider === "zoo") return estimateZooCost(prompt);
  if (provider === "openscad") {
    return {
      provider: "openscad",
      estimatedCostUsd: 0,
      confidence: "high",
      notes: "Local / cloud OpenSCAD — no Zoo charge",
    };
  }
  return {
    provider,
    estimatedCostUsd: 0,
    confidence: "low",
    notes: provider === "trellis" ? "PiAPI Trellis BYOK" : "Meshy BYOK fallback",
  };
}

export type PrintMaterial = "PLA" | "ABS" | "PETG" | "TPU";

export type PrintInfillPattern = "grid" | "gyroid" | "honeycomb" | "triangular" | "cubic";

export interface PrintSettings {
  layerHeight: number;
  infill: number;
  supports: boolean;
  material: PrintMaterial;
  /** Optional slicer pattern hint from AI Print Assistant. */
  infillPattern?: PrintInfillPattern;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  layerHeight: 0.2,
  infill: 20,
  supports: true,
  material: "PLA",
};

/** Format PrintSettings as G-CODE / slicer markdown for the CAD & Print tab. */
export function formatPrintSettingsMarkdown(settings: PrintSettings, lang: "ro" | "en" = "ro"): string {
  const pattern = settings.infillPattern ?? "grid";
  if (lang === "en") {
    return [
      "## G-CODE SETTINGS",
      "",
      `- Layer height: ${settings.layerHeight} mm`,
      `- Infill: ${settings.infill}% (${pattern})`,
      `- Supports: ${settings.supports ? "yes" : "no"}`,
      `- Material: ${settings.material}`,
    ].join("\n");
  }
  return [
    "## G-CODE SETTINGS",
    "",
    `- Înălțime strat: ${settings.layerHeight} mm`,
    `- Umplere (infill): ${settings.infill}% (${pattern})`,
    `- Suporturi: ${settings.supports ? "da" : "nu"}`,
    `- Material: ${settings.material}`,
  ].join("\n");
}

export function clampPrintSettings(partial: Partial<PrintSettings>): PrintSettings {
  const layerHeight = Number(partial.layerHeight ?? DEFAULT_PRINT_SETTINGS.layerHeight);
  const infill = Number(partial.infill ?? DEFAULT_PRINT_SETTINGS.infill);
  const material = partial.material ?? DEFAULT_PRINT_SETTINGS.material;
  const allowed: PrintMaterial[] = ["PLA", "ABS", "PETG", "TPU"];
  const patterns: PrintInfillPattern[] = ["grid", "gyroid", "honeycomb", "triangular", "cubic"];
  const infillPattern = partial.infillPattern;
  return {
    layerHeight: Math.min(0.4, Math.max(0.08, Number.isFinite(layerHeight) ? layerHeight : 0.2)),
    infill: Math.min(100, Math.max(0, Math.round(Number.isFinite(infill) ? infill : 20))),
    supports: Boolean(partial.supports ?? DEFAULT_PRINT_SETTINGS.supports),
    material: allowed.includes(material) ? material : "PLA",
    infillPattern:
      infillPattern && patterns.includes(infillPattern) ? infillPattern : partial.infillPattern === undefined
        ? DEFAULT_PRINT_SETTINGS.infillPattern
        : "grid",
  };
}
