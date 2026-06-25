import { generateOpenScad, repairOpenScad } from "./llm-client";
import { generateMeshFromPrompt } from "./mesh-client";
import { createCadJob, getCadJob, updateCadJob, uploadCadStl } from "./cad-repository";
import { renderScadToStl } from "./scad-runner";
import { computeStlBoundingBox } from "./stl-bbox";
import type { CreateCadJobInput, StlDimensions } from "./types";
const localStlFiles = new Map<string, Buffer>();
const localStlDimensions = new Map<string, StlDimensions>();
const localMeshTaskIds = new Map<string, string>();
const MAX_RENDER_REPAIRS = Number(process.env.CAD_MAX_RENDER_REPAIRS ?? 2);

export const getLocalStlBuffer = (jobId: string): Buffer | undefined => localStlFiles.get(jobId);
export const getLocalStlDimensions = (jobId: string): StlDimensions | undefined =>
  localStlDimensions.get(jobId);
export const getLocalMeshTaskId = (jobId: string): string | undefined =>
  localMeshTaskIds.get(jobId);
export const enqueueCadJob = async (input: CreateCadJobInput): Promise<string> => {
  const job = await createCadJob(input);
  void processCadJob(job.id, input);
  return job.id;
};

const processCadJob = async (jobId: string, input: CreateCadJobInput): Promise<void> => {
  const job = await getCadJob(jobId);
  if (!job) return;

  const generationMode = input.generationMode ?? "openscad";

  try {
    await updateCadJob(jobId, { status: "generating" });

    if (generationMode === "mesh") {
      await processMeshJob(jobId, job, input);
      return;
    }

    await processOpenScadJob(jobId, job, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateCadJob(jobId, { status: "failed", errorMessage: message });
  }
};

const processMeshJob = async (
  jobId: string,
  job: Awaited<ReturnType<typeof getCadJob>>,
  input: CreateCadJobInput
): Promise<void> => {
  if (!job) return;

  const meshPrompt = input.meshPrompt?.trim() || job.prompt;
  const mesh = await generateMeshFromPrompt({
    prompt: meshPrompt,
    meshApiKey: input.meshApiKey,
    previousMeshTaskId: input.previousMeshTaskId,
  });

  if (!mesh.ok || !mesh.stlBuffer) {
    await updateCadJob(jobId, {
      status: "failed",
      errorMessage: mesh.error ?? "Mesh generation failed",
    });
    return;
  }

  await updateCadJob(jobId, { status: "rendering" });

  localStlFiles.set(jobId, mesh.stlBuffer);
  const dimensions = computeStlBoundingBox(mesh.stlBuffer);
  if (dimensions) localStlDimensions.set(jobId, dimensions);

  const uploaded = await uploadCadStl({
    jobId,
    cavalId: job.cavalId,
    buffer: mesh.stlBuffer,
  });

  const warnings: string[] = [];
  if (mesh.meshTaskId) {
    localMeshTaskIds.set(jobId, mesh.meshTaskId);
  }
  warnings.push("Check overhangs in your slicer before printing organic meshes.");

  await updateCadJob(jobId, {
    status: "done",
    stlPath: uploaded.path,
    stlUrl: uploaded.publicUrl,
    generatedScad: null,
    errorMessage: warnings.join(" · "),
  });
};

const processOpenScadJob = async (
  jobId: string,
  job: Awaited<ReturnType<typeof getCadJob>>,
  input: CreateCadJobInput
): Promise<void> => {
  if (!job) return;

  try {    const llm = await generateOpenScad({
      prompt: job.prompt,
      projectType: job.projectType ?? undefined,
      constraints: job.constraints,
      planContext: input.planContext,
      openRouterApiKey: input.openRouterApiKey,
      quality: input.quality,
      conversationHistory: input.conversationHistory,
      previousScad: input.previousScad,
    });

    if (!llm.ok || !llm.scad) {
      await updateCadJob(jobId, {
        status: "failed",
        errorMessage: llm.error ?? "LLM failed to generate OpenSCAD",
      });
      return;
    }

    let scad = llm.scad;
    await updateCadJob(jobId, { status: "rendering", generatedScad: scad });

    let rendered = await renderScadToStl(scad, jobId);
    let repairAttempts = 0;

    while (!rendered.ok && repairAttempts < MAX_RENDER_REPAIRS) {
      const fixed = await repairOpenScad({
        originalPrompt: job.prompt,
        brokenScad: scad,
        renderError: rendered.error ?? "OpenSCAD render failed",
        openRouterApiKey: input.openRouterApiKey,
        quality: input.quality,
      });
      repairAttempts += 1;
      if (!fixed.ok || !fixed.scad) break;
      scad = fixed.scad;
      await updateCadJob(jobId, { generatedScad: scad });
      rendered = await renderScadToStl(scad, jobId);
    }

    if (!rendered.ok || !rendered.stlBuffer) {
      await updateCadJob(jobId, {
        status: "failed",
        errorMessage: rendered.error ?? "OpenSCAD render failed after repair attempts",
        generatedScad: scad,
      });
      return;
    }

    localStlFiles.set(jobId, rendered.stlBuffer);
    const dimensions = computeStlBoundingBox(rendered.stlBuffer);
    if (dimensions) localStlDimensions.set(jobId, dimensions);
    const uploaded = await uploadCadStl({
      jobId,
      cavalId: job.cavalId,
      buffer: rendered.stlBuffer,
    });

    const warnings: string[] = [];
    if (llm.usedFallback) {
      warnings.push(llm.error ?? "Used fallback mock geometry");
    }
    if (repairAttempts > 0) {
      warnings.push(`OpenSCAD repaired ${repairAttempts} time(s) before render`);
    }

    await updateCadJob(jobId, {
      status: "done",
      stlPath: uploaded.path,
      stlUrl: uploaded.publicUrl,
      generatedScad: scad,
      errorMessage: warnings.length ? warnings.join(" · ") : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateCadJob(jobId, { status: "failed", errorMessage: message });
  }
};