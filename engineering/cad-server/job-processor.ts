import { generateOpenScad } from "./llm-client";
import { createCadJob, getCadJob, updateCadJob, uploadCadStl } from "./cad-repository";
import { renderScadToStl } from "./scad-runner";
import type { CreateCadJobInput } from "./types";

const localStlFiles = new Map<string, Buffer>();

export const getLocalStlBuffer = (jobId: string): Buffer | undefined => localStlFiles.get(jobId);

export const enqueueCadJob = async (input: CreateCadJobInput): Promise<string> => {
  const job = await createCadJob(input);
  void processCadJob(job.id);
  return job.id;
};

const processCadJob = async (jobId: string): Promise<void> => {
  const job = await getCadJob(jobId);
  if (!job) return;

  try {
    await updateCadJob(jobId, { status: "generating" });
    const llm = await generateOpenScad({
      prompt: job.prompt,
      projectType: job.projectType ?? undefined,
      constraints: job.constraints,
    });

    if (!llm.ok || !llm.scad) {
      await updateCadJob(jobId, {
        status: "failed",
        errorMessage: llm.error ?? "LLM failed to generate OpenSCAD",
      });
      return;
    }

    await updateCadJob(jobId, { status: "rendering", generatedScad: llm.scad });
    const rendered = await renderScadToStl(llm.scad, jobId);
    if (!rendered.ok || !rendered.stlBuffer) {
      await updateCadJob(jobId, {
        status: "failed",
        errorMessage: rendered.error ?? "OpenSCAD render failed",
        generatedScad: llm.scad,
      });
      return;
    }

    localStlFiles.set(jobId, rendered.stlBuffer);
    const uploaded = await uploadCadStl({
      jobId,
      cavalId: job.cavalId,
      buffer: rendered.stlBuffer,
    });

    await updateCadJob(jobId, {
      status: "done",
      stlPath: uploaded.path,
      stlUrl: uploaded.publicUrl,
      generatedScad: llm.scad,
      errorMessage: llm.usedFallback ? llm.error ?? "Used fallback geometry" : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateCadJob(jobId, { status: "failed", errorMessage: message });
  }
};
