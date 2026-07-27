import type { Print3DPlannerResult } from "./print3d-planner";
import { isOpenScadInstalled, OPENSCAD_INSTALL_HINT_RO } from "./scad-runner";

export function resolveMeshApiKey(override?: string): string | undefined {
  return override?.trim() || process.env.MESHY_API_KEY?.trim() || undefined;
}

/** Free-form / organic / creature objects → Meshy text-to-3D. */
export const FREEFORM_MESH_RE =
  /(dulap|cabinet|wardrobe|mobilier|furniture|figurin[aăe]?|sculptur[aăe]?|statuie|bust|character|personaj|organic|decorative|ornament|vaz[aă]|vase|lamp[aă]|cosmetic|animal|animale|insect[aăe]?|insecte|creatur[aăe]?|monstru|monster|dragon|dinozaur|dinosaur|câine|caine|dog|pisic[aă]?|cat|cal\b|horse|pasăre|pasare|bird|fluture|butterfly|albina|bee|păianjen|paianjen|spider|broasca|frog|șarpe|sarpe|snake|pește|peste|fish|rechin|shark|urs\b|bear|leu\b|lion|tiger|tigru|elephant|elefant|rabbit|iepure|mouse|șoarece|soarece|human|om\b|humanoid|alien|extraterestr|robot\s*(jucăr|toy|cute|kawaii)|toy\s*robot|android|cyborg|plant[aăe]?|floare|flower|copac|tree|cactus|mushroom|ciuperc|food|mâncare|mancare|fruit|fruct)/iu;

/** Parametric / precision mechanical → OpenSCAD. */
export const MECHANICAL_OPENSCAD_RE =
  /(bracket|mount|suport|prindere|gear|angrenaj|roat[aă]|wheel\s*(hub|bore)|enclosure|carcas[aă]\s*(pcb|esp|iot)|cutie\s*(pcb|senzor)|case\s*m3|cadru|frame\s*plate|drone|fpv|landing\s*gear|motor\s*mount|g[aă]uri\s*m[2345]|holes?\s*m[2345]|parametric|pcb|esp32|iot|senzor\s*aer|air\s*quality|mașin[aăi]|masina|toy\s*car|vehicle|camion|truck|tractor|elicopter|helicopter|\bheli\b|robot\s*(arm|braț|brat|chassis|kit|mecatronic|actuator|joint)|servo|bearing|rulment)/iu;

export const MESHY_REQUIRED_HINT_RO =
  "Pentru obiecte libere (animale, insecte, figurine, robot jucărie, mobilier organic) adaugă cheia Meshy în Setări → AI & Chei API (mesh.apiKey / MESHY_API_KEY). OpenSCAD e doar pentru piese mecanice precise.";

export const MESHY_REQUIRED_HINT_EN =
  "For free-form objects (animals, insects, figurines, toy robots, organic furniture) add a Meshy API key in Settings (mesh.apiKey / MESHY_API_KEY). OpenSCAD is only for precise mechanical parts.";

/** True when the prompt should use Meshy (text-to-3D), not OpenSCAD. */
export function suggestMeshFromPrompt(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // Precision mechanical always wins.
  if (MECHANICAL_OPENSCAD_RE.test(t)) return false;
  if (FREEFORM_MESH_RE.test(t)) return true;
  // Descriptive object without engineering cues → prefer mesh so "any object" works.
  if (
    !/(m[2345]\b|mm\b|parametric|openscad|stl\s*mount|bracket|pcb|esp32)/i.test(t) &&
    t.length >= 6
  ) {
    return true;
  }
  return false;
}

export function isClearlyMechanicalPrompt(text: string): boolean {
  return MECHANICAL_OPENSCAD_RE.test(text);
}

export async function adjustPlanPipeline(
  plan: Print3DPlannerResult,
  meshApiKey?: string
): Promise<Print3DPlannerResult> {
  const openscad = await isOpenScadInstalled();
  const meshKey = resolveMeshApiKey(meshApiKey);
  const warnings = [...(plan.warnings ?? [])];

  let pipeline = plan.pipeline;
  const wantsMesh =
    plan.intent === "organic" ||
    plan.intent === "figurine" ||
    suggestMeshFromPrompt(plan.technicalPrompt) ||
    suggestMeshFromPrompt(plan.assistantMessage ?? "");

  if (pipeline === "openscad" && wantsMesh && !isClearlyMechanicalPrompt(plan.technicalPrompt)) {
    if (meshKey) {
      pipeline = "mesh";
    } else {
      // Keep mesh intent so the client can show a clear Meshy requirement.
      pipeline = "mesh";
      warnings.push(
        plan.userLanguage === "ro" ? MESHY_REQUIRED_HINT_RO : MESHY_REQUIRED_HINT_EN
      );
    }
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
    const already = warnings.some((w) => /Meshy|mesh\.apiKey/i.test(w));
    if (!already) {
      warnings.push(
        plan.userLanguage === "ro" ? MESHY_REQUIRED_HINT_RO : MESHY_REQUIRED_HINT_EN
      );
    }
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
