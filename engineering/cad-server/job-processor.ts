import { generateOpenScad, repairOpenScad } from "./llm-client";
import { resolveMeshApiKey } from "./cad-capabilities";
import { generateMeshFromPrompt } from "./mesh-client";
import {
  createCadJob,
  getCadJob,
  updateCadJob,
  uploadPrivateCadStl,
} from "./storage/index";
import { renderScadToStl, isOpenScadInstalled, OPENSCAD_INSTALL_HINT_RO } from "./scad-runner";
import { tryInstallOpenScad } from "./openscad-install";
import { computeStlBoundingBox } from "./stl-bbox";
import type { CreateCadJobInput } from "./types";
import { appendJobLog } from "./services/job-logger";
import {
  clearJobAbort,
  isJobAborted,
  registerJobAbort,
} from "./services/job-registry";
import { cadLog } from "./middleware/logger";
import { setLocalStl } from "./storage/local-artifacts";

const MAX_RENDER_REPAIRS = Number(process.env.CAD_MAX_RENDER_REPAIRS ?? 2);

export const enqueueCadJob = async (
  input: CreateCadJobInput,
  ownerCavalId: string
): Promise<string> => {
  const job = await createCadJob(input, ownerCavalId);
  appendJobLog(job.id, { level: "info", event: "job_created", message: job.prompt.slice(0, 120) });
  cadLog({ level: "info", event: "job_created", jobId: job.id, cavalId: job.cavalId ?? undefined });
  void processCadJob(job.id, input);
  return job.id;
};

const failIfAborted = (jobId: string): void => {
  if (isJobAborted(jobId)) throw new Error("Job cancelled");
};

const processCadJob = async (jobId: string, input: CreateCadJobInput): Promise<void> => {
  const signal = registerJobAbort(jobId);
  const job = await getCadJob(jobId);
  if (!job) return;

  const generationMode = input.generationMode ?? job.generationMode ?? "openscad";
  const meshApiKey = resolveMeshApiKey(input.meshApiKey);

  try {
    failIfAborted(jobId);
    await updateCadJob(jobId, { status: "generating" });
    appendJobLog(jobId, { level: "info", event: "job_updated", message: "generating" });

    let mode = generationMode;
    if (mode === "openscad" && !(await isOpenScadInstalled())) {
      await tryInstallOpenScad();
    }
    if (mode === "openscad" && !(await isOpenScadInstalled())) {
      if (meshApiKey) {
        appendJobLog(jobId, {
          level: "warn",
          event: "pipeline_fallback",
          message: "openscad missing → mesh",
        });
        mode = "mesh";
      } else {
        await updateCadJob(jobId, { status: "failed", errorMessage: OPENSCAD_INSTALL_HINT_RO });
        appendJobLog(jobId, { level: "error", event: "job_failed", message: OPENSCAD_INSTALL_HINT_RO });
        return;
      }
    }

    if (mode === "mesh") {
      await processMeshJob(jobId, job, input, signal);
      return;
    }

    await processOpenScadJob(jobId, job, input, signal, meshApiKey);
  } catch (error) {
    if (signal.aborted || isJobAborted(jobId)) {
      await updateCadJob(jobId, { status: "cancelled", errorMessage: "Cancelled by user" });
      appendJobLog(jobId, { level: "warn", event: "job_cancelled" });
      cadLog({ level: "info", event: "job_cancelled", jobId });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    await updateCadJob(jobId, { status: "failed", errorMessage: message });
    appendJobLog(jobId, { level: "error", event: "job_failed", message });
    cadLog({ level: "error", event: "job_failed", jobId, message });
  } finally {
    clearJobAbort(jobId);
  }
};

const processMeshJob = async (
  jobId: string,
  job: NonNullable<Awaited<ReturnType<typeof getCadJob>>>,
  input: CreateCadJobInput,
  signal: AbortSignal
): Promise<void> => {
  failIfAborted(jobId);

  const meshPrompt = input.meshPrompt?.trim() || job.prompt;
  const mesh = await generateMeshFromPrompt({
    prompt: meshPrompt,
    meshApiKey: input.meshApiKey,
    previousMeshTaskId: input.previousMeshTaskId,
  });

  if (signal.aborted) throw new Error("Job cancelled");

  if (!mesh.ok || !mesh.stlBuffer) {
    await updateCadJob(jobId, {
      status: "failed",
      errorMessage: mesh.error ?? "Mesh generation failed",
    });
    appendJobLog(jobId, { level: "error", event: "job_failed", message: mesh.error });
    return;
  }

  await updateCadJob(jobId, { status: "rendering", meshTaskId: mesh.meshTaskId ?? null });
  appendJobLog(jobId, { level: "info", event: "job_updated", message: "rendering" });

  const dimensions = computeStlBoundingBox(mesh.stlBuffer);
  setLocalStl(jobId, mesh.stlBuffer, dimensions, mesh.meshTaskId ?? null);

  const uploaded = await uploadPrivateCadStl({
    jobId,
    cavalId: job.cavalId,
    buffer: mesh.stlBuffer,
  });

  const warnings = ["Check overhangs in your slicer before printing organic meshes."];
  await updateCadJob(jobId, {
    status: "done",
    stlPath: uploaded.path,
    generatedScad: null,
    errorMessage: warnings.join(" · "),
    meshTaskId: mesh.meshTaskId ?? null,
  });
  appendJobLog(jobId, { level: "info", event: "job_completed" });
  cadLog({ level: "info", event: "job_completed", jobId });
};

const processOpenScadJob = async (
  jobId: string,
  job: NonNullable<Awaited<ReturnType<typeof getCadJob>>>,
  input: CreateCadJobInput,
  signal: AbortSignal,
  meshApiKey?: string
): Promise<void> => {
  failIfAborted(jobId);

  const llm = await generateOpenScad({
    prompt: job.prompt,
    projectType: job.projectType ?? undefined,
    constraints: job.constraints,
    planContext: input.planContext,
    openRouterApiKey: input.openRouterApiKey,
    quality: input.quality,
    conversationHistory: input.conversationHistory,
    previousScad: input.previousScad,
  });

  if (signal.aborted) throw new Error("Job cancelled");

  if (!llm.ok || !llm.scad) {
    await updateCadJob(jobId, {
      status: "failed",
      errorMessage: llm.error ?? "LLM failed to generate OpenSCAD",
    });
    appendJobLog(jobId, { level: "error", event: "job_failed", message: llm.error });
    return;
  }

  let scad = llm.scad;
  await updateCadJob(jobId, { status: "rendering", generatedScad: scad });
  appendJobLog(jobId, { level: "info", event: "job_updated", message: "rendering" });

  let rendered = await renderScadToStl(scad, jobId);
  let repairAttempts = 0;

  while (!rendered.ok && repairAttempts < MAX_RENDER_REPAIRS) {
    failIfAborted(jobId);
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
    const renderErr = rendered.error ?? "OpenSCAD render failed after repair attempts";
    const canMesh =
      Boolean(meshApiKey) &&
      (/OpenSCAD nu e instalat|not installed|ENOENT/i.test(renderErr) ||
        repairAttempts >= MAX_RENDER_REPAIRS);

    if (canMesh) {
      appendJobLog(jobId, {
        level: "warn",
        event: "pipeline_fallback",
        message: `openscad render failed → mesh: ${renderErr.slice(0, 120)}`,
      });
      await processMeshJob(jobId, job, input, signal);
      return;
    }

    await updateCadJob(jobId, {
      status: "failed",
      errorMessage: renderErr,
      generatedScad: scad,
    });
    appendJobLog(jobId, { level: "error", event: "job_failed", message: renderErr });
    return;
  }

  const dimensions = computeStlBoundingBox(rendered.stlBuffer);
  setLocalStl(jobId, rendered.stlBuffer, dimensions);

  const uploaded = await uploadPrivateCadStl({
    jobId,
    cavalId: job.cavalId,
    buffer: rendered.stlBuffer,
  });

  const warnings: string[] = [];
  if (llm.usedFallback) warnings.push(llm.error ?? "Used fallback mock geometry");
  if (repairAttempts > 0) warnings.push(`OpenSCAD repaired ${repairAttempts} time(s) before render`);

  await updateCadJob(jobId, {
    status: "done",
    stlPath: uploaded.path,
    generatedScad: scad,
    errorMessage: warnings.length ? warnings.join(" · ") : null,
  });
  appendJobLog(jobId, { level: "info", event: "job_completed" });
  cadLog({ level: "info", event: "job_completed", jobId });
};

export const cancelCadJobProcessing = async (jobId: string): Promise<boolean> => {
  const { cancelJobProcessing } = await import("./services/job-registry");
  const aborted = cancelJobProcessing(jobId);
  await updateCadJob(jobId, { status: "cancelled", errorMessage: "Cancelled by user" });
  appendJobLog(jobId, { level: "warn", event: "job_cancelled" });
  return aborted;
};

export { getLocalStlBuffer } from "./storage/local-artifacts";
