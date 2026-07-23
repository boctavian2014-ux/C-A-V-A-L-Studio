/**
 * Dual-mode batch STL generation for Robotics BOM components.
 */

import type { RoboticsBomComponent, RoboticsComponentBom } from '../../../ai/engineering/robotics-components-schema';
import type { EngProject } from '../../../ai/engineering/engineering-generator';
import {
  mapEngProjectToConstraints,
  mapEngProjectToPlanContext,
  inferCadProjectType,
} from '../../../ai/engineering/cad-prompt';
import {
  isLibraryModeUnsupportedError,
  normalizeCadErrorMessage,
} from '../../../ai/engineering/cad-errors';

export type CadPartStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface CadBatchPart {
  id: string;
  name: string;
  mode: 'standard' | 'custom';
  standardKey?: string;
  qty: number;
  status: CadPartStatus;
  stlUrl?: string | null;
  stlBase64?: string;
  localPath?: string;
  error?: string;
  jobId?: string;
}

function blobUrlFromBase64(base64: string, mime = 'model/stl'): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

async function fetchStlAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  } catch {
    return null;
  }
}

async function pollJobUntilDone(
  jobId: string,
  signal?: AbortSignal
): Promise<{
  ok: boolean;
  stlUrl?: string | null;
  error?: string;
}> {
  const cad = window.caval?.cad;
  if (!cad?.getJob) return { ok: false, error: 'getJob missing' };
  const started = Date.now();
  while (Date.now() - started < 300_000) {
    if (signal?.aborted) return { ok: false, error: 'Anulat' };
    const userIdResult = await window.caval.billingUserId?.();
    const job = await cad.getJob({ jobId, cavalId: userIdResult?.userId });
    if (!job.ok) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (job.status === 'done') {
      return { ok: true, stlUrl: job.stlUrl };
    }
    if (job.status === 'failed' || job.status === 'cancelled') {
      return { ok: false, error: job.error ?? `Job ${job.status}` };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { ok: false, error: 'Timeout' };
}

function componentPrompt(c: RoboticsBomComponent, userPrompt: string): string {
  const dims = c.dimensions
    ? `Dimensions: ${c.dimensions.width ?? '?'}×${c.dimensions.height ?? '?'}×${c.dimensions.depth ?? '?'} ${c.dimensions.unit ?? 'mm'}`
    : '';
  return [
    `Generate a single printable part: ${c.name}`,
    `Category: ${c.category}`,
    c.material ? `Material: ${c.material}` : '',
    dims,
    c.notes ? `Notes: ${c.notes}` : '',
    `Context robot: ${userPrompt.slice(0, 800)}`,
    'Output mechanical OpenSCAD suitable for STL export. One solid part only.',
  ]
    .filter(Boolean)
    .join('\n');
}

async function createJobWithLibraryFallback(input: {
  scad: string;
  standardKey: string;
  userPrompt: string;
  project: EngProject;
  cavalId?: string;
}): Promise<{ ok: boolean; jobId?: string; error?: string }> {
  const cad = window.caval?.cad;
  if (!cad?.createJob) return { ok: false, error: 'CAD API indisponibil' };

  const base = {
    prompt: `Render standard library part ${input.standardKey} — keep geometry, only fix syntax if needed.`,
    projectType: inferCadProjectType(input.userPrompt, input.project.spec),
    constraints: mapEngProjectToConstraints(input.project.spec) as Record<string, string | undefined>,
    planContext: mapEngProjectToPlanContext(input.project),
    cavalId: input.cavalId,
    previousScad: input.scad,
    quality: 'standard' as const,
  };

  const libraryAttempt = await cad.createJob({
    ...base,
    generationMode: 'library',
  });
  if (libraryAttempt.ok && libraryAttempt.jobId) {
    return { ok: true, jobId: libraryAttempt.jobId };
  }

  const err = libraryAttempt.error ?? '';
  if (isLibraryModeUnsupportedError(err) || /Invalid option|bad_request/i.test(err)) {
    const openscadAttempt = await cad.createJob({
      ...base,
      generationMode: 'openscad',
    });
    if (openscadAttempt.ok && openscadAttempt.jobId) {
      return { ok: true, jobId: openscadAttempt.jobId };
    }
    return {
      ok: false,
      error: normalizeCadErrorMessage(openscadAttempt.error) ?? openscadAttempt.error ?? 'createJob failed',
    };
  }

  return {
    ok: false,
    error: normalizeCadErrorMessage(err) ?? err ?? 'createJob failed for library scad',
  };
}

export async function runRoboticsCadBatch(params: {
  bom: RoboticsComponentBom;
  project: EngProject;
  userPrompt: string;
  projectPath?: string | null;
  signal?: AbortSignal;
  onPartUpdate: (parts: CadBatchPart[]) => void;
}): Promise<{ parts: CadBatchPart[]; summary: string }> {
  const parts: CadBatchPart[] = params.bom.components.map((c) => ({
    id: c.id,
    name: c.name,
    mode: c.mode,
    standardKey: c.standardKey,
    qty: c.qty,
    status: 'pending',
  }));
  params.onPartUpdate([...parts]);

  const cad = window.caval?.cad;
  const lib = window.caval?.roboticsLibrary;
  const userIdResult = await window.caval.billingUserId?.();
  const cavalId = userIdResult?.userId;

  for (let i = 0; i < parts.length; i++) {
    if (params.signal?.aborted) {
      parts[i] = { ...parts[i], status: 'skipped', error: 'Anulat' };
      params.onPartUpdate([...parts]);
      continue;
    }

    const comp = params.bom.components[i];
    parts[i] = { ...parts[i], status: 'running', error: undefined };
    params.onPartUpdate([...parts]);

    try {
      if (comp.mode === 'standard' && comp.standardKey && lib?.resolve) {
        const resolved = await lib.resolve(comp.standardKey);
        if (!resolved.ok) {
          throw new Error(resolved.error ?? 'Library resolve failed');
        }

        if (resolved.format === 'stl' && resolved.contentBase64) {
          const stlUrl = blobUrlFromBase64(resolved.contentBase64);
          let localPath: string | undefined;
          if (params.projectPath && lib.saveStlToProject) {
            const saved = await lib.saveStlToProject({
              projectPath: params.projectPath,
              fileName: `${comp.id}.stl`,
              base64: resolved.contentBase64,
            });
            if (saved.ok) localPath = saved.savedPath;
          }
          parts[i] = {
            ...parts[i],
            status: 'done',
            stlUrl,
            stlBase64: resolved.contentBase64,
            localPath,
          };
          params.onPartUpdate([...parts]);
          continue;
        }

        if (resolved.format === 'scad' && resolved.contentText && cad) {
          const created = await createJobWithLibraryFallback({
            scad: resolved.contentText,
            standardKey: comp.standardKey!,
            userPrompt: params.userPrompt,
            project: params.project,
            cavalId,
          });
          if (!created.ok || !created.jobId) {
            throw new Error(created.error ?? 'createJob failed for library scad');
          }
          const done = await pollJobUntilDone(created.jobId, params.signal);
          if (!done.ok || !done.stlUrl) {
            throw new Error(normalizeCadErrorMessage(done.error) ?? done.error ?? 'Library render failed');
          }
          const base64 = await fetchStlAsBase64(done.stlUrl);
          let localPath: string | undefined;
          if (base64 && params.projectPath && lib.saveStlToProject) {
            const saved = await lib.saveStlToProject({
              projectPath: params.projectPath,
              fileName: `${comp.id}.stl`,
              base64,
            });
            if (saved.ok) localPath = saved.savedPath;
          }
          parts[i] = {
            ...parts[i],
            status: 'done',
            stlUrl: done.stlUrl,
            stlBase64: base64 ?? undefined,
            localPath,
            jobId: created.jobId,
          };
          params.onPartUpdate([...parts]);
          continue;
        }

        throw new Error('Library entry unusable');
      }

      // Custom → OpenSCAD LLM job
      if (!cad?.createJob) throw new Error('CAD API indisponibil');
      const prompt = componentPrompt(comp, params.userPrompt);
      const created = await cad.createJob({
        prompt,
        projectType: inferCadProjectType(params.userPrompt, params.project.spec),
        constraints: mapEngProjectToConstraints(params.project.spec) as Record<string, string | undefined>,
        planContext: {
          ...mapEngProjectToPlanContext(params.project),
          components: `${comp.name} ×${comp.qty}`,
        },
        cavalId,
        generationMode: 'openscad',
        quality: 'standard',
      });
      if (!created.ok || !created.jobId) {
        throw new Error(created.error ?? 'createJob failed');
      }
      const done = await pollJobUntilDone(created.jobId, params.signal);
      if (!done.ok || !done.stlUrl) {
        throw new Error(done.error ?? 'Custom CAD failed');
      }
      const base64 = await fetchStlAsBase64(done.stlUrl);
      let localPath: string | undefined;
      if (base64 && params.projectPath && lib?.saveStlToProject) {
        const saved = await lib.saveStlToProject({
          projectPath: params.projectPath,
          fileName: `${comp.id}.stl`,
          base64,
        });
        if (saved.ok) localPath = saved.savedPath;
      }
      parts[i] = {
        ...parts[i],
        status: 'done',
        stlUrl: done.stlUrl,
        stlBase64: base64 ?? undefined,
        localPath,
        jobId: created.jobId,
      };
    } catch (err) {
      parts[i] = {
        ...parts[i],
        status: 'failed',
        error: normalizeCadErrorMessage(
          err instanceof Error ? err.message : String(err)
        ) ?? (err instanceof Error ? err.message : String(err)),
      };
    }
    params.onPartUpdate([...parts]);
  }

  const done = parts.filter((p) => p.status === 'done').length;
  const failed = parts.filter((p) => p.status === 'failed').length;
  const std = parts.filter((p) => p.mode === 'standard' && p.status === 'done').length;
  const custom = parts.filter((p) => p.mode === 'custom' && p.status === 'done').length;
  const summary = `${done} STL gata (${std} standard · ${custom} custom)${failed ? ` · ${failed} eșuate` : ''}`;
  return { parts, summary };
}

export async function exportBatchZip(
  parts: CadBatchPart[],
  projectPath?: string | null
): Promise<{ ok: boolean; savedPath?: string; error?: string; canceled?: boolean }> {
  const lib = window.caval?.roboticsLibrary;
  if (!lib?.exportZip) return { ok: false, error: 'exportZip indisponibil' };
  const files = parts
    .filter((p) => p.status === 'done' && p.stlBase64)
    .map((p) => ({ name: `${p.id}.stl`, base64: p.stlBase64! }));
  if (files.length === 0) return { ok: false, error: 'Niciun STL cu date pentru zip' };
  return lib.exportZip({ projectPath: projectPath ?? undefined, files });
}
