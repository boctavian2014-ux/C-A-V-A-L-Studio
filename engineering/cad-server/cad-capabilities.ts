import type { Print3DPlannerResult } from "./print3d-planner";
import { isMeshGenerationConfigured, resolveMeshApiKey } from "./mesh-client";
import { isOpenScadInstalled, OPENSCAD_INSTALL_HINT_RO } from "./scad-runner";
import { isZooGenerationConfigured } from "./zoo-client";

export { resolveMeshApiKey, isMeshGenerationConfigured } from "./mesh-client";
export { isZooGenerationConfigured } from "./zoo-client";

export const ZOO_PREFERRED_HINT_RO =
  "Generez piesa mecanică cu Zoo text-to-CAD (fallback OpenSCAD dacă job-ul eșuează — failed calls nu se taxează).";
export const ZOO_PREFERRED_HINT_EN =
  "Generating mechanical part with Zoo text-to-CAD (OpenSCAD fallback if the job fails — failed calls are not charged).";
export const ZOO_REQUIRED_HINT_RO =
  "Pentru piese mecanice via Zoo, adaugă ZOO_API_TOKEN în Setări → AI & Chei API (sau CAD_ZOO_MOCK=1 pentru teste).";
export const ZOO_REQUIRED_HINT_EN =
  "For Zoo mechanical parts, add ZOO_API_TOKEN in Settings → AI & API Keys (or CAD_ZOO_MOCK=1 for local tests).";

/** Free-form / organic / creature / prop objects → text-to-3D (PiAPI Trellis / Meshy). */
export const FREEFORM_MESH_RE =
  /(dulap|cabinet|wardrobe|mobilier|furniture|sertar|drawer|figurin[aăe]?|sculptur[aăe]?|statuie|bust|character|personaj|organic|decorative|ornament|vaz[aă]|vase|lamp[aă]|cosmetic|ciocan|hammer|mjolnir|thor[\s-]?hammer|weapon\s*prop|prop\s*hammer|animal|animale|insect[aăe]?|insecte|creatur[aăe]?|monstru|monster|dragon|dinozaur|dinosaur|câine|caine|dog|pisic[aă]?|cat|cal\b|horse|pasăre|pasare|bird|fluture|butterfly|albina|bee|păianjen|paianjen|spider|broasca|frog|șarpe|sarpe|snake|pește|peste|fish|rechin|shark|urs\b|bear|leu\b|lion|tiger|tigru|elephant|elefant|rabbit|iepure|mouse|șoarece|soarece|human|om\b|humanoid|alien|extraterestr|robot\s*(jucăr|toy|cute|kawaii)|toy\s*robot|android|cyborg|plant[aăe]?|floare|flower|copac|tree|cactus|mushroom|ciuperc|food|mâncare|mancare|fruit|fruct)/iu;

/** Parametric / precision mechanical → OpenSCAD. */
export const MECHANICAL_OPENSCAD_RE =
  /(bracket|mount|suport|prindere|gear|angrenaj|roat[aă]|wheel\s*(hub|bore)|enclosure|carcas[aă]\s*(pcb|esp|iot)|cutie\s*(pcb|senzor)|case\s*m3|cadru|frame\s*plate|drone|fpv|landing\s*gear|motor\s*mount|g[aă]uri\s*m[2345]|holes?\s*m[2345]|parametric|pcb|esp32|iot|senzor\s*aer|air\s*quality|mașin[aăi]|masina|toy\s*car|diecast|vehicle|camion|truck|tractor|ferrari|porsche|lamborghini|sports?\s*car|coupe|elicopter|helicopter|\bheli\b|robot\s*(arm|braț|brat|chassis|kit|mecatronic|actuator|joint)|servo|bearing|rulment)/iu;

export const MESH_REQUIRED_HINT_RO =
  "Pentru obiecte libere (animale, insecte, figurine, robot jucărie, mobilier organic) e nevoie de cheia PiAPI Trellis (sau Meshy) în Setări → AI & Chei API. OpenSCAD e doar pentru piese mecanice precise.";

export const MESH_REQUIRED_HINT_EN =
  "For free-form objects (animals, insects, figurines, toy robots, organic furniture) add a PiAPI Trellis key (or Meshy) in Settings → AI & API Keys. OpenSCAD is only for precise mechanical parts.";

/** True when the prompt should use text-to-3D mesh, not OpenSCAD. */
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
  meshApiKey?: string,
  piapiApiKey?: string,
  zooApiToken?: string
): Promise<Print3DPlannerResult> {
  const openscad = await isOpenScadInstalled();
  const meshReady = isMeshGenerationConfigured(meshApiKey, piapiApiKey);
  const zooReady = isZooGenerationConfigured(zooApiToken);
  const warnings = [...(plan.warnings ?? [])];

  let pipeline = plan.pipeline;
  const wantsMesh =
    plan.intent === "organic" ||
    plan.intent === "figurine" ||
    suggestMeshFromPrompt(plan.technicalPrompt) ||
    suggestMeshFromPrompt(plan.assistantMessage ?? "");
  const mechanical =
    plan.intent === "mechanical" || isClearlyMechanicalPrompt(plan.technicalPrompt);

  // Never flip mechanical OpenSCAD plans (toy cars, brackets, etc.) back to mesh —
  // mesh models often hallucinate bathtubs/furniture instead of the requested part.
  if (
    pipeline === "openscad" &&
    wantsMesh &&
    !mechanical
  ) {
    // Keep mesh intent so the client can show a clear provider requirement when missing.
    pipeline = "mesh";
    if (!meshReady) {
      warnings.push(
        plan.userLanguage === "ro" ? MESH_REQUIRED_HINT_RO : MESH_REQUIRED_HINT_EN
      );
    }
  }

  // Prefer Zoo for mechanical custom parts when configured (OpenSCAD remains job-level fallback).
  if (pipeline === "openscad" && mechanical && zooReady) {
    pipeline = "zoo";
    warnings.push(plan.userLanguage === "ro" ? ZOO_PREFERRED_HINT_RO : ZOO_PREFERRED_HINT_EN);
  }

  if (pipeline === "openscad" && !openscad) {
    if (zooReady) {
      pipeline = "zoo";
      warnings.push(
        plan.userLanguage === "ro"
          ? "OpenSCAD nu e instalat — generez cu Zoo text-to-CAD."
          : "OpenSCAD not installed — generating with Zoo text-to-CAD."
      );
    } else if (meshReady) {
      pipeline = "mesh";
      warnings.push(
        plan.userLanguage === "ro"
          ? "OpenSCAD nu e instalat — generez model 3D direct din text (cloud OSS / Meshy)."
          : "OpenSCAD not installed — generating 3D directly from text (cloud OSS / Meshy)."
      );
    } else {
      warnings.push(OPENSCAD_INSTALL_HINT_RO);
    }
  }

  if (pipeline === "zoo" && !zooReady) {
    pipeline = openscad ? "openscad" : meshReady ? "mesh" : "openscad";
    warnings.push(plan.userLanguage === "ro" ? ZOO_REQUIRED_HINT_RO : ZOO_REQUIRED_HINT_EN);
  }

  if (pipeline === "mesh" && !meshReady) {
    const already = warnings.some((w) => /Meshy|mesh\.apiKey|MESH_WORKER|TRELLIS|text-to-3D/i.test(w));
    if (!already) {
      warnings.push(
        plan.userLanguage === "ro" ? MESH_REQUIRED_HINT_RO : MESH_REQUIRED_HINT_EN
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
