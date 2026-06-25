import { generateOpenScad, repairOpenScad } from "./llm-client";
import { createCadJob, getCadJob, updateCadJob, uploadCadStl } from "./cad-repository";
import { renderScadToStl } from "./scad-runner";
import type { CreateCadJobInput } from "./types";

const localStlFiles = new Map<string, Buffer>();
const MAX_RENDER_REPAIRS = Number(process.env.CAD_MAX_RENDER_REPAIRS ?? 2);

export const getLocalStlBuffer = (jobId: string): Buffer | undefined => localStlFiles.get(jobId);

export const enqueueCadJob = async (input: CreateCadJobInput): Promise<string> => {
  const job = await createCadJob(input);
  void processCadJob(job.id, input);
  return job.id;
};

const processCadJob = async (jobId: string, input: CreateCadJobInput): Promise<void> => {
  const job = await getCadJob(jobId);
  if (!job) return;

  try {
    await updateCadJob(jobId, { status: "generating" });
    const llm = await generateOpenScad({
      prompt: job.prompt,
      projectType: job.projectType ?? undefined,
      constraints: job.constraints,
      planContext: input.planContext,
      openRouterApiKey: input.openRouterApiKey,
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
