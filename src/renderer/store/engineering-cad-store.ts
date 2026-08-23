import { create } from 'zustand';
import { assertRendererChatAllowed } from '../../../ai/safety/renderer-chat-guard';
import {
  buildCadTechnicalPrompt,
  inferCadProjectType,
} from '../../../ai/engineering/cad-prompt';
import { normalizeCadErrorMessage } from '../../../ai/engineering/cad-errors';
import {
  buildToyVehicleScad,
  isToyVehiclePrompt,
} from '../../../ai/engineering/toy-vehicle-scad';
import {
  buildToyHelicopterScad,
  isToyHelicopterPrompt,
} from '../../../ai/engineering/toy-helicopter-scad';
import type { EngProject } from '../../../ai/engineering/engineering-generator';
import { useAIStore } from '../../../ai/composer/ai-store';
import { useEditorStore } from './editor-store';
import type {
  CadChatMessage,
  CadJobStatus,
  StlDimensions,
} from '../../../engineering/cad-server/types';
import type { RoboticsComponentBom } from '../../../ai/engineering/robotics-components-schema';
import {
  exportBatchZip,
  runRoboticsCadBatch,
  type CadBatchPart,
} from './engineering-cad-batch';

export type { CadJobStatus };

/** UI state machine (maps server statuses into coarse phases). */
export type CadStorePhase =
  | 'idle'
  | 'submitting'
  | 'processing'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'stale';

export interface CadJobPlan {
  project: EngProject;
  userPrompt: string;
  projectPath?: string | null;
  conversationHistory?: CadChatMessage[];
  attachments?: Array<{ path: string; name: string; content: string }>;
  modelId?: string;
  previousMeshTaskId?: string;
  previousScad?: string;
}

export interface GenerateCadInput {
  spec: EngProject['spec'];
  build: EngProject['build'];
  userPrompt: string;
  schema?: EngProject['schema'];
  parts?: EngProject['parts'];
}

const LOG_PREFIX = '[engineering-cad]';
const POLL_BASE_MS = 2_000;
const POLL_MAX_MS = 12_000;
const POLL_TIMEOUT_MS = 300_000;
const MAX_CREATE_RETRIES = 3;

function log(message: string, extra?: unknown): void {
  if (extra !== undefined) console.info(LOG_PREFIX, message, extra);
  else console.info(LOG_PREFIX, message);
}

function serverStatusToPhase(status: CadJobStatus | null | undefined): CadStorePhase {
  if (!status) return 'processing';
  if (status === 'done') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  return 'processing';
}

function pollDelayMs(attempt: number): number {
  const exp = Math.min(POLL_MAX_MS, POLL_BASE_MS * 2 ** attempt);
  const jitter = Math.floor(Math.random() * 400);
  return exp + jitter;
}

function isTerminalStatus(status: CadJobStatus | null | undefined): boolean {
  return status === 'done' || status === 'failed' || status === 'cancelled';
}

type PollToken = { aborted: boolean; timer: ReturnType<typeof setTimeout> | null };

let pollToken: PollToken | null = null;
let submitAbort: AbortController | null = null;

function stopPolling(): void {
  if (pollToken) {
    pollToken.aborted = true;
    if (pollToken.timer) clearTimeout(pollToken.timer);
    pollToken = null;
  }
}

function abortSubmit(): void {
  submitAbort?.abort();
  submitAbort = null;
}

async function loadCadCredentials(): Promise<{
  openRouterConfigured: boolean;
  meshConfigured: boolean;
  cadApiUrl?: string;
}> {
  const caval = window.caval;
  const [settingsResult, secretsResult, health] = await Promise.all([
    caval.settingsLoad?.() ?? Promise.resolve({ ok: true, settings: {} }),
    caval.secretsGet?.() ?? Promise.resolve({ ok: true, configured: {} }),
    caval.cad?.health?.() ?? Promise.resolve(null),
  ]);
  const settings = (settingsResult?.settings ?? {}) as Record<string, string>;
  const configured = (secretsResult?.configured ?? {}) as Record<string, boolean>;
  const cloudMesh =
    Boolean(health?.ok) &&
    Boolean(
      health?.meshConfigured ||
        health?.meshWorkerConfigured ||
        health?.piapiConfigured ||
        health?.meshyConfigured
    );
  return {
    openRouterConfigured:
      configured.OPENROUTER_API_KEY === true ||
      settings['openrouter.configured'] === 'true',
    meshConfigured:
      cloudMesh ||
      configured.PIAPI_API_KEY === true ||
      configured.TRELLIS_API_KEY === true ||
      configured.MESHY_API_KEY === true ||
      settings['mesh.configured'] === 'true' ||
      settings['trellis.configured'] === 'true',
    cadApiUrl: settings['cad.apiUrl'],
  };
}

async function preflightCadCloud(cad: NonNullable<typeof window.caval>['cad']): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  if (!cad?.health) return { ok: true };
  const health = await cad.health();
  if (!health.ok) {
    return {
      ok: false,
      error: 'CAD Cloud offline. Settings → CAD Cloud 3D.',
    };
  }
  return { ok: true };
}

async function warmCadPipeline(modelId: string, projectPath: string | null | undefined): Promise<void> {
  const caval = window.caval;
  if (!caval?.preload) return;
  try {
    await caval.preload.notify({
      action: 'engineering.cad',
      modelId,
      openFiles: projectPath ? [projectPath] : undefined,
    });
    await caval.preload.warm(modelId, 'composer');
  } catch (err) {
    log('preload warm skipped', err instanceof Error ? err.message : err);
  }
}

async function resolveCadModel(modelId: string): Promise<string> {
  const caval = window.caval;
  if (!caval?.resolveModel) return modelId;
  try {
    const res = await caval.resolveModel({ model: modelId, intent: 'planning' });
    if (res.ok && res.resolved?.modelId) return res.resolved.modelId;
  } catch (err) {
    log('resolveModel fallback', err instanceof Error ? err.message : err);
  }
  return modelId;
}

interface EngineeringCadState {
  phase: CadStorePhase;
  jobId: string | null;
  serverStatus: CadJobStatus | null;
  stlUrl: string | null;
  stlFileName: string | null;
  /** Baked STL after viewer edits (base64). Preferred for download. */
  editedStlBase64: string | null;
  scadContent: string | null;
  dimensions: StlDimensions | null;
  meshTaskId: string | null;
  cadTitle: string | null;
  error: string | null;
  statusMessage: string | null;
  downloadMessage: string | null;
  retryCount: number;
  lastPlan: CadJobPlan | null;
  batchParts: CadBatchPart[];
  activePartId: string | null;
  batchSummary: string | null;
  batchBusy: boolean;
  activeBatchJobIds: string[];

  /** @deprecated use phase !== 'idle' */
  cadBusy: boolean;
  /** @deprecated use serverStatus */
  cadStatus: CadJobStatus | null;
  /** @deprecated use error */
  cadError: string | null;
  /** @deprecated use statusMessage */
  generateMessage: string | null;

  createCadJob: (plan: CadJobPlan) => Promise<void>;
  createBatchFromBom: (input: {
    bom: RoboticsComponentBom;
    project: EngProject;
    userPrompt: string;
    projectPath?: string | null;
  }) => Promise<void>;
  setActivePartId: (id: string | null) => void;
  exportBatchZip: () => Promise<{ ok: boolean; savedPath?: string; error?: string; canceled?: boolean }>;
  pollCadJob: (jobId: string) => Promise<void>;
  cancelCadJob: (opts?: { skipRemote?: boolean }) => Promise<void>;
  retryCadJob: () => Promise<void>;
  clearCadJob: () => void;
  downloadStl: () => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>;
  setEditedStl: (base64: string) => void;
  clearEditedStl: () => void;

  /** @deprecated use createCadJob */
  generateCad3d: (input: GenerateCadInput) => Promise<void>;
  /** @deprecated use clearCadJob */
  clearCadPreview: () => void;
  /** @deprecated use cancelCadJob */
  stopPoll: () => void;
}

function syncLegacyFields(
  patch: Partial<EngineeringCadState>,
  current?: Pick<
    EngineeringCadState,
    'phase' | 'serverStatus' | 'error' | 'statusMessage' | 'batchBusy'
  >
): Partial<EngineeringCadState> {
  const phase = patch.phase ?? current?.phase ?? 'idle';
  const serverStatus = patch.serverStatus ?? current?.serverStatus ?? null;
  const error = patch.error !== undefined ? patch.error : (current?.error ?? null);
  const statusMessage =
    patch.statusMessage !== undefined ? patch.statusMessage : (current?.statusMessage ?? null);
  return {
    ...patch,
    cadBusy:
      phase === 'submitting' ||
      phase === 'processing' ||
      phase === 'cancelling' ||
      Boolean(patch.batchBusy ?? current?.batchBusy),
    cadStatus: serverStatus,
    cadError: error,
    generateMessage: statusMessage,
  };
}

function normalizeJobIds(jobIds: Array<string | null | undefined>): string[] {
  return Array.from(new Set(jobIds.map((id) => String(id ?? '').trim()).filter(Boolean)));
}

function getActiveCadJobIds(state: Pick<
  EngineeringCadState,
  'jobId' | 'batchParts' | 'activeBatchJobIds'
>): string[] {
  return normalizeJobIds([
    state.jobId,
    ...state.activeBatchJobIds,
    ...state.batchParts.map((part) => part.jobId ?? null),
  ]);
}

function hasActiveCadWork(state: Pick<
  EngineeringCadState,
  'phase' | 'jobId' | 'batchBusy' | 'batchParts' | 'activeBatchJobIds'
>): boolean {
  if (state.batchBusy) return true;
  if (state.phase === 'submitting' || state.phase === 'processing' || state.phase === 'cancelling') {
    return true;
  }
  if (state.phase === 'stale' && Boolean(state.jobId)) {
    return true;
  }
  return false;
}

function setBatchJobIdsFromParts(parts: CadBatchPart[]): string[] {
  return normalizeJobIds(parts.map((part) => part.jobId ?? null));
}

function resetJobFields(): Partial<EngineeringCadState> {
  return syncLegacyFields({
    phase: 'idle',
    jobId: null,
    serverStatus: null,
    stlUrl: null,
    stlFileName: null,
    editedStlBase64: null,
    scadContent: null,
    dimensions: null,
    meshTaskId: null,
    cadTitle: null,
    error: null,
    statusMessage: null,
    downloadMessage: null,
    batchParts: [],
    activePartId: null,
    batchSummary: null,
    batchBusy: false,
    activeBatchJobIds: [],
  });
}

export const useEngineeringCadStore = create<EngineeringCadState>()((set, get) => {
  const patch = (partial: Partial<EngineeringCadState>) => {
    set((s) => ({ ...s, ...syncLegacyFields(partial, s) }));
  };

  return {
  phase: 'idle',
  jobId: null,
  serverStatus: null,
  stlUrl: null,
  stlFileName: null,
  editedStlBase64: null,
  scadContent: null,
  dimensions: null,
  meshTaskId: null,
  cadTitle: null,
  error: null,
  statusMessage: null,
  downloadMessage: null,
  retryCount: 0,
  lastPlan: null,
  batchParts: [],
  activePartId: null,
  batchSummary: null,
  batchBusy: false,
  activeBatchJobIds: [],

  cadBusy: false,
  cadStatus: null,
  cadError: null,
  generateMessage: null,

  clearCadJob: () => {
    const current = get();
    if (hasActiveCadWork(current)) {
      void current.cancelCadJob();
      return;
    }
    stopPolling();
    abortSubmit();
    patch(resetJobFields());
    log('cleared');
  },

  clearCadPreview: () => {
    void get().clearCadJob();
  },

  cancelCadJob: async (opts) => {
    const current = get();
    const jobIds = getActiveCadJobIds(current);
    const targetJobIds = jobIds.length > 0 ? jobIds : current.jobId ? [current.jobId] : [];
    const hasActiveWork = hasActiveCadWork(current);
    stopPolling();
    abortSubmit();
    if (!hasActiveWork) {
      return;
    }

    patch({
      phase: 'cancelling',
      error: null,
      statusMessage: 'Se anulează jobul CAD…',
    });

    let remoteFailed = false;
    let partialCancel = false;
    let remoteSkipped = false;
    if (!opts?.skipRemote && targetJobIds.length) {
      try {
        const userIdResult = await window.caval.billingUserId?.();
        const workspaceRoot = get().lastPlan?.projectPath ?? useEditorStore.getState().projectPath ?? undefined;
        if (window.caval?.cad?.cancelJobs && targetJobIds.length > 1) {
          const res = await window.caval.cad.cancelJobs({
            jobIds: targetJobIds,
            cavalId: userIdResult?.userId,
            workspaceRoot,
          });
          remoteSkipped = res?.results?.every((item) => item.remoteCancel === 'skipped') ?? false;
          partialCancel = Boolean(res?.partiallyCancelled);
          remoteFailed = !res?.ok || Boolean(res?.results?.some((item) => item.ok === false));
        } else if (window.caval?.cad?.cancelJob) {
          const results = await Promise.all(
            targetJobIds.map((jobId) =>
              window.caval.cad.cancelJob({
                jobId,
                cavalId: userIdResult?.userId,
                workspaceRoot,
              })
            )
          );
          remoteSkipped = results.length > 0 && results.every((res) => res.remoteCancel === 'skipped');
          remoteFailed = results.some((res) => res && res.ok === false);
          partialCancel = results.some((res) => res.ok) && remoteFailed;
        } else {
          remoteSkipped = true;
        }
      } catch {
        remoteFailed = true;
      }
    } else {
      remoteSkipped = true;
    }

    if (remoteFailed) {
      patch({
        phase: 'stale',
        error: 'Cancel neconfirmat / job posibil activ',
        statusMessage: partialCancel
          ? 'Anulare parțială — Cancel neconfirmat / job posibil activ'
          : 'Cancel neconfirmat / job posibil activ',
      });
      log('cancel stale', {
        jobIds: targetJobIds,
        remote: remoteSkipped ? 'skipped' : 'failed',
      });
      return;
    }

    patch({
      phase: 'cancelled',
      serverStatus: 'cancelled',
      error: null,
      statusMessage: remoteSkipped
        ? 'Generare CAD oprită local.'
        : 'Generare CAD anulată.',
    });
    log('cancelled', {
      jobIds: targetJobIds,
      remote: remoteSkipped ? 'skipped' : 'ok',
    });
  },

  stopPoll: () => {
    void get().cancelCadJob();
  },

  downloadStl: async () => {
    const { stlUrl, stlFileName, editedStlBase64 } = get();
    const defaultName = stlFileName
      ? (editedStlBase64 && !stlFileName.includes('-edited')
          ? stlFileName.replace(/\.stl$/i, '-edited.stl')
          : stlFileName)
      : editedStlBase64
        ? 'model-edited.stl'
        : 'model.stl';

    if (editedStlBase64 && window.caval?.cad?.saveStlBase64) {
      const result = await window.caval.cad.saveStlBase64({
        base64: editedStlBase64,
        defaultName,
      });
      if (!result.canceled) {
        set({
          downloadMessage: result.ok
            ? `STL (cu modificări) salvat: ${result.path}`
            : `Eroare: ${result.error ?? 'download failed'}`,
        });
      }
      return result;
    }

    if (!stlUrl || !window.caval?.cad?.downloadStl) {
      return { ok: false, error: 'Niciun STL disponibil.' };
    }
    const userIdResult = await window.caval.billingUserId?.();
    const result = await window.caval.cad.downloadStl({
      url: stlUrl,
      defaultName,
      cavalId: userIdResult?.userId,
    });
    if (!result.canceled) {
      set({
        downloadMessage: result.ok
          ? `STL salvat: ${result.path}`
          : `Eroare: ${result.error ?? 'download failed'}`,
      });
    }
    return result;
  },

  setEditedStl: (base64: string) => {
    const prev = get().stlUrl;
    if (prev?.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(prev);
      } catch {
        /* ignore */
      }
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'model/stl' }));
    const name = get().stlFileName ?? 'model.stl';
    const editedName = name.replace(/\.stl$/i, '') + '-edited.stl';
    patch({
      editedStlBase64: base64,
      stlUrl: blobUrl,
      stlFileName: editedName,
      downloadMessage: 'Modificări salvate local — Download STL include transformările.',
    });
    log('edited stl saved', `${Math.round(base64.length * 0.75)} bytes`);
  },

  clearEditedStl: () => {
    const prev = get().stlUrl;
    const edited = get().editedStlBase64;
    if (edited && prev?.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(prev);
      } catch {
        /* ignore */
      }
    }
    patch({ editedStlBase64: null });
  },

  pollCadJob: async (jobId: string) => {
    const cad = window.caval?.cad;
    if (!cad?.getJob) {
      patch({ phase: 'failed', error: 'CAD getJob indisponibil.' });
      return;
    }

    const startedAt = Date.now();
    let attempt = 0;
    const token: PollToken = { aborted: false, timer: null };
    pollToken = token;

    const tick = async (): Promise<void> => {
      if (token.aborted) return;

      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        stopPolling();
        patch({
          phase: 'failed',
          serverStatus: 'failed',
          error: 'Timeout generare CAD (5 min).',
        });
        return;
      }

      try {
        const userIdResult = await window.caval.billingUserId?.();
        const job = await cad.getJob({ jobId, cavalId: userIdResult?.userId });
        if (token.aborted) return;

        if (!job.ok) {
          attempt += 1;
          if (attempt >= MAX_CREATE_RETRIES) {
            stopPolling();
            patch({
              phase: 'failed',
              serverStatus: 'failed',
              error: job.error ?? 'Eroare la polling CAD.',
            });
            return;
          }
          token.timer = setTimeout(() => { void tick(); }, pollDelayMs(attempt));
          return;
        }

        const status = (job.status ?? 'queued') as CadJobStatus;
        const phase = serverStatusToPhase(status);
        const nextStl = job.stlUrl ?? get().stlUrl;
        const clearEdit = Boolean(job.stlUrl && job.stlUrl !== get().stlUrl);
        patch({
          serverStatus: status,
          phase,
          stlUrl: nextStl,
          scadContent: job.scad ?? get().scadContent,
          dimensions: job.dimensions ?? get().dimensions,
          meshTaskId: job.meshTaskId ?? get().meshTaskId,
          ...(clearEdit ? { editedStlBase64: null } : {}),
          error: status === 'failed' ? normalizeCadErrorMessage(job.error ?? 'Generarea modelului a eșuat.') : null,
          statusMessage:
            status === 'done' && job.stlUrl
              ? 'Model STL generat — vezi preview în centru.'
              : get().statusMessage,
        });

        if (isTerminalStatus(status)) {
          stopPolling();
          log('poll terminal', {
            jobId,
            status,
            error: job.error ?? null,
            hasStl: Boolean(job.stlUrl),
          });
          return;
        }

        attempt += 1;
        token.timer = setTimeout(() => { void tick(); }, pollDelayMs(attempt));
      } catch (err) {
        attempt += 1;
        if (attempt >= MAX_CREATE_RETRIES) {
          stopPolling();
          patch({
            phase: 'failed',
            serverStatus: 'failed',
            error: err instanceof Error ? err.message : String(err),
          });
          return;
        }
        token.timer = setTimeout(() => { void tick(); }, pollDelayMs(attempt));
      }
    };

    await tick();
  },

  createCadJob: async (plan: CadJobPlan) => {
    const current = get();
    if (current.cadBusy || current.batchBusy) {
      return;
    }
    const caval = window.caval;
    const cad = caval?.cad;
    if (!cad?.createJob || typeof cad.plan !== 'function') {
      patch({
        phase: 'failed',
        error: 'CAD API indisponibil. Verifică Setări → CAD Cloud 3D.',
      });
      return;
    }

    const cloudCheck = await preflightCadCloud(cad);
    if (!cloudCheck.ok) {
      patch({ phase: 'failed', error: cloudCheck.error });
      return;
    }

    if (hasActiveCadWork(current)) {
      patch({
        phase: 'failed',
        error: 'Oprește jobul CAD curent înainte de o generare nouă',
      });
      return;
    }

    submitAbort = new AbortController();

    const { project, userPrompt } = plan;
    const primaryStl = project.build.find((b) => b.kind === 'stl');
    const aiState = useAIStore.getState();
    const editorState = useEditorStore.getState();
    const modelId = plan.modelId ?? aiState.selectedModel ?? 'caval-auto/free';
    const resolvedModel = await resolveCadModel(modelId);

    const rawUser = userPrompt.trim();
    if (!rawUser) {
      patch({
        phase: 'failed',
        error: 'Nicio cerere salvată pentru STL. Scrie în chat Robotics, Generează planul, apoi Generează 3D.',
      });
      return;
    }

    // Geometry must follow the chat prompt only — EngProject title/BOM often
    // hallucinate furniture and must NOT drive Trellis / OpenSCAD.
    const geometryPrompt = rawUser.slice(0, 4_000);
    const technicalPrompt = buildCadTechnicalPrompt(project, geometryPrompt);
    const workspaceRoot = plan.projectPath ?? editorState.projectPath;

    try {
      assertRendererChatAllowed({
        prompt: geometryPrompt,
        workspaceRoot,
        capability: 'planning',
        intent: 'planning',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      patch({ phase: 'failed', error: msg });
      return;
    }

    patch({
      phase: 'submitting',
      jobId: null,
      serverStatus: 'queued',
      stlUrl: null,
      scadContent: null,
      dimensions: null,
      meshTaskId: null,
      error: null,
      statusMessage: 'Planificare CAD…',
      downloadMessage: null,
      stlFileName: primaryStl?.name ?? 'model.stl',
      cadTitle: primaryStl?.name ?? project.spec.title,
      lastPlan: plan,
      retryCount: 0,
      activeBatchJobIds: [],
    });

    await warmCadPipeline(resolvedModel, workspaceRoot);

    const credentials = await loadCadCredentials();
    // Never feed polluted Robotics plan / Coding attachments into CAD geometry.
    const planMessages: CadChatMessage[] = [
      { role: 'user', content: geometryPrompt },
    ];

    if (submitAbort.signal.aborted) return;

    let planResult;
    try {
      planResult = await cad.plan({
        messages: planMessages,
        latestUserText: geometryPrompt,
        previousMeshTaskId: plan.previousMeshTaskId,
      });
    } catch (err) {
      patch({
        phase: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (submitAbort.signal.aborted) return;

    if (!planResult.ok || !planResult.plan) {
      patch({
        phase: 'failed',
        error: planResult.error ?? 'Planner CAD indisponibil.',
      });
      return;
    }

    if (planResult.plan.action === 'clarify') {
      patch({
        phase: 'failed',
        error: planResult.plan.assistantMessage ?? 'Specifică mai clar piesa 3D de generat.',
      });
      return;
    }

    const pipeline = planResult.plan.pipeline;
    const planWarnings = planResult.plan.warnings?.filter(Boolean) ?? [];
    const toyVehicle = isToyVehiclePrompt(geometryPrompt);
    const toyHeli = isToyHelicopterPrompt(geometryPrompt);
    const toyLibrary = toyVehicle || toyHeli;
    const forceOpenScadFallback =
      toyLibrary || (pipeline === 'mesh' && !credentials.meshConfigured);
    // Toy cars / helicopters: never Trellis/mesh — always OpenSCAD library template.
    const generationMode = toyLibrary
      ? 'library'
      : forceOpenScadFallback
        ? 'openscad'
        : pipeline;

    // Prefer planner tech only when it still mentions the user's subject; else raw chat.
    const plannerTech = planResult.plan.technicalPrompt?.trim() ?? '';
    const userTokens = geometryPrompt
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length >= 4)
      .slice(0, 8);
    const plannerPolluted =
      /(dulap|cabinet|wardrobe|drawer|sertar|bookshelf|comod|bathtub|bath\s*tub|\btub\b|basin|cad[aă]\b|cada\b|sink|toilet)/i.test(
        plannerTech
      );
    const plannerMatchesUser =
      !toyLibrary &&
      plannerTech.length > 20 &&
      userTokens.some((t) => plannerTech.toLowerCase().includes(t)) &&
      !plannerPolluted;

    const meshPrompt = [
      geometryPrompt,
      'FDM printable, single watertight solid, flat base, manifold, mm scale ~80-180 mm.',
      'Match ONLY this subject — do not invent furniture, drawers, cabinets, bathtubs, tubs, basins, or unrelated objects.',
    ].join('\n');

    const toyScad = toyHeli
      ? buildToyHelicopterScad(geometryPrompt)
      : toyVehicle
        ? buildToyVehicleScad(geometryPrompt)
        : undefined;
    const jobPrompt = toyHeli
      ? `TOY HELICOPTER (library template): ${geometryPrompt}`
      : toyVehicle
        ? `TOY VEHICLE (library template): ${geometryPrompt}`
      : forceOpenScadFallback && pipeline === 'mesh'
      ? [
          `USER OBJECT (exact): ${geometryPrompt}`,
          'Approximate THIS exact object with OpenSCAD primitives (cubes, cylinders, spheres, hull).',
          'FORBIDDEN: cabinets, drawers, dulap, sertare, shelf units, bathtubs, tubs, or any furniture unless the user asked for that.',
          'Watertight, flat base, mm units. Silhouette fidelity over mechanical precision.',
        ].join('\n\n')
      : generationMode === 'mesh'
        ? meshPrompt
        : plannerMatchesUser
          ? plannerTech
          : [
              `USER OBJECT (exact): ${geometryPrompt}`,
              plannerTech && !plannerPolluted ? plannerTech : technicalPrompt,
            ]
              .filter(Boolean)
              .join('\n\n')
              .slice(0, 12_000);

    log('geometry prompt', {
      user: geometryPrompt.slice(0, 120),
      mode: generationMode,
      toyVehicle,
      toyHeli,
      meshConfigured: credentials.meshConfigured,
    });

    const userIdResult = await caval.billingUserId?.();
    const projectType = toyHeli
      ? 'helicopter'
      : toyVehicle
        ? 'vehicle'
        : inferCadProjectType(geometryPrompt, project.spec);
    const workspaceRootArg = workspaceRoot ?? undefined;

    let created;
    let createAttempt = 0;
    while (createAttempt < MAX_CREATE_RETRIES) {
      if (submitAbort.signal.aborted) return;
      try {
        created = await cad.createJob({
          prompt: jobPrompt.slice(0, 12_000),
          projectType,
          cavalId: userIdResult?.userId,
          workspaceRoot: workspaceRootArg,
          conversationHistory: planMessages,
          previousScad: toyScad,
          previousMeshTaskId: toyLibrary || forceOpenScadFallback ? undefined : plan.previousMeshTaskId,
          generationMode,
          meshPrompt: generationMode === 'mesh' ? meshPrompt.slice(0, 12_000) : undefined,
          quality: 'standard',
        });
        if (created?.code === 'cad_job_in_progress') {
          patch({
            phase: 'failed',
            error: created.ownerIsCaller === false
              ? created.error ?? 'Un job CAD este deja în curs în acest workspace'
              : created.error ?? 'Un job CAD este deja în curs în acest workspace',
          });
          return;
        }
        if (created?.ok) break;
      } catch (err) {
        created = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      createAttempt += 1;
      if (createAttempt < MAX_CREATE_RETRIES) {
        await new Promise((r) => setTimeout(r, pollDelayMs(createAttempt)));
      }
    }

    if (submitAbort.signal.aborted) {
      const abortedJobId = created?.jobId;
      if (abortedJobId) {
        await cad.cancelJob({
          jobId: abortedJobId,
          cavalId: userIdResult?.userId,
          workspaceRoot: workspaceRootArg,
        }).catch(() => undefined);
      }
      return;
    }

    if (!created?.ok || !created.jobId) {
      patch({
        phase: 'failed',
        error: normalizeCadErrorMessage(created?.error ?? 'Nu am putut crea job-ul CAD.'),
        retryCount: createAttempt,
      });
      return;
    }

    const jobId = created.jobId;
    const status = (created.status as CadJobStatus) ?? 'queued';
    const meshTaskId = (created as { meshTaskId?: string | null }).meshTaskId ?? null;
    const statusMessage = toyHeli
      ? 'Template elicopter jucărie (OpenSCAD) — fără Trellis…'
      : toyVehicle
        ? 'Template mașină solidă (OpenSCAD) — fără Trellis…'
        : forceOpenScadFallback
        ? 'TRELLIS/Meshy indisponibil — generez previzualizare 3D cu OpenSCAD…'
        : planWarnings.length > 0
          ? planWarnings.join(' · ')
          : generationMode === 'mesh'
            ? 'Generez model 3D din text pe cloud (PiAPI Trellis / Meshy)…'
            : 'Generez STL pe server cloud (OpenSCAD)…';
    patch({
      phase: 'processing',
      jobId,
      serverStatus: status,
      meshTaskId,
      statusMessage,
    });

    log('job created', { jobId, status, projectType });
    await get().pollCadJob(jobId);
  },

  retryCadJob: async () => {
    const { lastPlan, jobId, retryCount } = get();
    if (!lastPlan) {
      patch({ phase: 'failed', error: 'Niciun job anterior de reluat.' });
      return;
    }
    set({ retryCount: retryCount + 1 });
    log('retry', { previousJobId: jobId, retryCount: retryCount + 1 });
    await get().createCadJob({
      ...lastPlan,
      previousMeshTaskId: get().meshTaskId ?? lastPlan.previousMeshTaskId,
      previousScad: get().scadContent ?? lastPlan.previousScad,
    });
  },

  generateCad3d: async (input: GenerateCadInput) => {
    const project: EngProject = {
      spec: input.spec,
      schema: input.schema ?? { nodes: [], connections: [], powerBudget: '—', protocols: [] },
      parts: input.parts ?? [],
      build: input.build,
    };
    const editorState = useEditorStore.getState();
    await get().createCadJob({
      project,
      userPrompt: input.userPrompt,
      projectPath: editorState.projectPath,
    });
  },

  setActivePartId: (id) => {
    const part = get().batchParts.find((p) => p.id === id);
    const prev = get().stlUrl;
    if (get().editedStlBase64 && prev?.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(prev);
      } catch {
        /* ignore */
      }
    }
    patch({
      activePartId: id,
      stlUrl: part?.stlUrl ?? get().stlUrl,
      stlFileName: part ? `${part.id}.stl` : get().stlFileName,
      cadTitle: part?.name ?? get().cadTitle,
      editedStlBase64: null,
    });
  },

  exportBatchZip: async () => {
    const { batchParts } = get();
    const editorState = useEditorStore.getState();
    const result = await exportBatchZip(batchParts, editorState.projectPath);
    if (!result.canceled) {
      set({
        downloadMessage: result.ok
          ? `ZIP salvat: ${result.savedPath}`
          : `Zip: ${result.error ?? 'failed'}`,
      });
    }
    return result;
  },

  createBatchFromBom: async (input) => {
    if (get().cadBusy || get().batchBusy) return;
    const cad = window.caval?.cad;
    if (!cad?.createJob) {
      patch({ phase: 'failed', error: 'CAD API indisponibil.' });
      return;
    }
    const cloudCheck = await preflightCadCloud(cad);
    if (!cloudCheck.ok) {
      patch({ phase: 'failed', error: cloudCheck.error });
      return;
    }

    stopPolling();
    abortSubmit();
    submitAbort = new AbortController();

    patch({
      phase: 'processing',
      batchBusy: true,
      batchParts: [],
      batchSummary: null,
      activePartId: null,
      activeBatchJobIds: [],
      error: null,
      statusMessage: 'Batch STL: standard librărie + custom OpenSCAD…',
      stlUrl: null,
    });

    try {
      const { parts, summary } = await runRoboticsCadBatch({
        bom: input.bom,
        project: input.project,
        userPrompt: input.userPrompt,
        projectPath: input.projectPath,
        signal: submitAbort.signal,
        onPartUpdate: (next) => {
          const firstDone = next.find((p) => p.status === 'done' && p.stlUrl);
          const activeBatchJobIds = setBatchJobIdsFromParts(next);
          const interrupted = get().phase === 'cancelling' || get().phase === 'stale';
          patch({
            batchParts: next,
            activeBatchJobIds,
            ...(interrupted
              ? {}
              : {
                  statusMessage: `Batch: ${next.filter((p) => p.status === 'done').length}/${next.length}`,
                }),
            ...(firstDone && !get().stlUrl && !interrupted
              ? {
                  stlUrl: firstDone.stlUrl,
                  stlFileName: `${firstDone.id}.stl`,
                  cadTitle: firstDone.name,
                  activePartId: firstDone.id,
                  phase: 'completed' as const,
                }
              : {}),
          });
        },
      });

      const current = get();
      const first = parts.find((p) => p.status === 'done' && p.stlUrl);
      const anyFail = parts.some((p) => p.status === 'failed');
      const interrupted = submitAbort?.signal.aborted || current.phase === 'cancelled' || current.phase === 'stale';
      patch({
        batchParts: parts,
        batchSummary: summary,
        batchBusy: false,
        activeBatchJobIds: [],
        phase: interrupted ? current.phase : first ? 'completed' : 'failed',
        stlUrl: interrupted ? current.stlUrl : first?.stlUrl ?? null,
        stlFileName: interrupted ? current.stlFileName : first ? `${first.id}.stl` : null,
        cadTitle: interrupted ? current.cadTitle : first?.name ?? null,
        activePartId: interrupted ? current.activePartId : first?.id ?? null,
        statusMessage: interrupted ? current.statusMessage ?? summary : summary,
        error: interrupted ? current.error : first ? null : anyFail ? 'Niciun STL generat.' : 'Batch anulat.',
      });
    } catch (err) {
      patch({
        batchBusy: false,
        activeBatchJobIds: [],
        phase: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      submitAbort = null;
    }
  },
  };
});
