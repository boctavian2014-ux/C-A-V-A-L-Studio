import type { Print3DPlannerResult } from "./print3d-planner";
import { isOpenScadInstalled, OPENSCAD_INSTALL_HINT_RO } from "./scad-runner";

export function resolveMeshApiKey(override?: string): string | undefined {
  return override?.trim() || process.env.MESHY_API_KEY?.trim() || undefined;
}

const MESH_KEYWORDS =
  /\b(dulap|cabinet|wardrobe|mobilier|furniture|figurin[aă]|sculptur[aă]|animal|fa[tț][aă]|bust|character|organic|decorative|ornament|vaz[aă]|vase|lamp[aă]|lamp shade|cosmetic)\b/i;

const OPENSCAD_KEYWORDS =
  /\b(bracket|mount|suport|prindere|gear|roat[aă]|wheel|enclosure|cutie|case|cadru|frame|plate|drone|fpv|landing|motor mount|g[aă]uri|holes|m3|parametric|pcb|esp32)\b/i;

/** Heuristic when planner picks openscad but mesh is a better fit for free-form objects. */
export function suggestMeshFromPrompt(text: string): boolean {
  const lower = text.toLowerCase();
  if (MESH_KEYWORDS.test(lower)) return true;
  if (OPENSCAD_KEYWORDS.test(lower)) return false;
  // Enclosures / housings without precision cues → mesh is more forgiving
  if (/\b(housing|enclosure|cutie|case|carcas[aă])\b/i.test(lower)) return true;
  return false;
}

export async function adjustPlanPipeline(
  plan: Print3DPlannerResult,
  meshApiKey?: string
): Promise<Print3DPlannerResult> {
  const openscad = await isOpenScadInstalled();
  const meshKey = resolveMeshApiKey(meshApiKey);
  const warnings = [...(plan.warnings ?? [])];

  let pipeline = plan.pipeline;

  if (pipeline === "openscad" && suggestMeshFromPrompt(plan.technicalPrompt)) {
    if (meshKey) pipeline = "mesh";
  }

  if (pipeline === "openscad" && !openscad) {
    if (meshKey) {
      pipeline = "mesh";
      warnings.push(
        plan.userLanguage === "ro"
          ? "OpenSCAD nu e instalat — generez model 3D direct din text (Meshy)."
          : "OpenSCAD not installed — generating 3D directly from text (Meshy)."
      );
    } else {
      warnings.push(OPENSCAD_INSTALL_HINT_RO);
    }
  }

  if (pipeline === "mesh" && !meshKey) {
    warnings.push(
      plan.userLanguage === "ro"
        ? "Pentru obiecte libere (dulap, figurine) adaugă cheia Meshy în Setări → mesh.apiKey."
        : "For free-form objects add a Meshy API key in Settings → mesh.apiKey."
    );
  }

  return {
    ...plan,
    pipeline,
    warnings: warnings.length ? warnings : undefined,
  };
}

export async function canRenderOpenScad(): Promise<boolean> {
  return isOpenScadInstalled();
}
