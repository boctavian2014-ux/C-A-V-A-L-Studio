/**
 * Shared Zoo (KittyCAD) text-to-CAD contract + print settings.
 * Live API: POST /ai/text-to-cad/{output_format}, then GET /ai/text-to-cad/{id} until completed.
 * Pricing note: ~$0.0083/sec with $20 free/month; failed calls are not charged (safe OpenSCAD fallback).
 */

export type ZooOutputFormat = "stl" | "step" | "gltf";

export type ZooJobStatus = "queued" | "processing" | "completed" | "failed";

export interface ZooJobRequest {
  prompt: string;
  outputFormat: ZooOutputFormat;
  /** Optional KittyCAD Language script for parametric parts (Phase 2+). */
  kcl?: string;
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
}

export type PrintMaterial = "PLA" | "ABS" | "PETG" | "TPU";

export interface PrintSettings {
  layerHeight: number;
  infill: number;
  supports: boolean;
  material: PrintMaterial;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  layerHeight: 0.2,
  infill: 20,
  supports: true,
  material: "PLA",
};

/** Format PrintSettings as G-CODE / slicer markdown for the CAD & Print tab. */
export function formatPrintSettingsMarkdown(settings: PrintSettings, lang: "ro" | "en" = "ro"): string {
  if (lang === "en") {
    return [
      "## G-CODE SETTINGS",
      "",
      `- Layer height: ${settings.layerHeight} mm`,
      `- Infill: ${settings.infill}%`,
      `- Supports: ${settings.supports ? "yes" : "no"}`,
      `- Material: ${settings.material}`,
    ].join("\n");
  }
  return [
    "## G-CODE SETTINGS",
    "",
    `- Înălțime strat: ${settings.layerHeight} mm`,
    `- Umplere (infill): ${settings.infill}%`,
    `- Suporturi: ${settings.supports ? "da" : "nu"}`,
    `- Material: ${settings.material}`,
  ].join("\n");
}

export function clampPrintSettings(partial: Partial<PrintSettings>): PrintSettings {
  const layerHeight = Number(partial.layerHeight ?? DEFAULT_PRINT_SETTINGS.layerHeight);
  const infill = Number(partial.infill ?? DEFAULT_PRINT_SETTINGS.infill);
  const material = partial.material ?? DEFAULT_PRINT_SETTINGS.material;
  const allowed: PrintMaterial[] = ["PLA", "ABS", "PETG", "TPU"];
  return {
    layerHeight: Math.min(0.4, Math.max(0.08, Number.isFinite(layerHeight) ? layerHeight : 0.2)),
    infill: Math.min(100, Math.max(0, Math.round(Number.isFinite(infill) ? infill : 20))),
    supports: Boolean(partial.supports ?? DEFAULT_PRINT_SETTINGS.supports),
    material: allowed.includes(material) ? material : "PLA",
  };
}
