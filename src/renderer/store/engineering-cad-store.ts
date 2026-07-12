import { create } from 'zustand';
import { assertRendererChatAllowed } from '../../../ai/safety/renderer-chat-guard';
import {
  buildCadTechnicalPrompt,
  inferCadProjectType,
  mapEngProjectToConstraints,
  mapEngProjectToPlanContext,
} from '../../../ai/engineering/cad-prompt';
import { normalizeCadErrorMessage } from '../../../ai/engineering/cad-errors';
import type { EngProject } from '../../../ai/engineering/engineering-generator';
import { useAIStore } from '../../../ai/composer/ai-store';
import { useEditorStore } from './editor-store';
import type {
  CadChatMessage,
  CadJobStatus,
  StlDimensions,
} from '../../../engineering/cad-server/types';

export type { CadJobStatus };

/** UI state machine (maps server statuses into coarse phases). */
export type CadStorePhase =
  | 'idle'
  | 'submitting'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

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
  openRouterApiKey?: string;
  meshApiKey?: string;
  cadApiUrl?: string;
}> {
  const caval = window.caval;
  const [settingsResult, secretsResult] = await Promise.all([
    caval.settingsLoad?.() ?? Promise.resolve({ ok: true, settings: {} }),
    caval.secretsGet?.() ?? Promise.resolve({ ok: true, secrets: {} }),
  ]);
  const settings = (settingsResult?.settings ?? {}) as Record<string, string>;
  const secrets = (secretsResult?.secrets ?? {}) as Record<string, string>;
  return {
    openRouterApiKey:
      settings['openrouter.apiKey'] ||
      settings['openRouter.apiKey'] ||
      secrets.OPENROUTER_API_KEY,
    meshApiKey: settings['mesh.apiKey'] || secrets.MESHY_API_KEY,
    cadApiUrl: settings['cad.apiUrl'],
  };
}

async function preflightCadCloud(cad: NonNullable<typeof window.caval>['cad']): Promise<
  | { ok: true; url?: string }
  | { ok: false; error: string }
> {
  if (!cad?.health) return { ok: true };
  const health = await cad.health();
  if (!health.ok) {
    return {
      ok: false,
      error:
        health.error ??
        `Server CAD cloud offline (${health.url ?? 'URL necunoscut'}). Setări → CAD Cloud 3D.`,
    };
  }
  return { ok: true, url: health.url };
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
  scadContent: string | null;
  dimensions: StlDimensions | null;
  meshTaskId: string | null;
  cadTitle: string | null;
  error: string | null;
  statusMessage: string | null;
  downloadMessage: string | null;
  retryCount: number;
  lastPlan: CadJobPlan | null;

  /** @deprecated use phase !== 'idle' */
  cadBusy: boolean;
  /** @deprecated use serverStatus */
  cadStatus: CadJobStatus | null;
  /** @deprecated use error */
  cadError: string | null;
  /** @deprecated use statusMessage */
  generateMessage: string | null;

  createCadJob: (plan: CadJobPlan) => Promise<void>;
  pollCadJob: (jobId: string) => Promise<void>;
  cancelCadJob: () => void;
  retryCadJob: () => Promise<void>;
  clearCadJob: () => void;
  downloadStl: () => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>;

  /** @deprecated use createCadJob */
  generateCad3d: (input: GenerateCadInput) => Promise<void>;
  /** @deprecated use clearCadJob */
  clearCadPreview: () => void;
  /** @deprecated use cancelCadJob */
  stopPoll: () => void;
}

function syncLegacyFields(
  patch: Partial<EngineeringCadState>,
  current?: Pick<EngineeringCadState, 'phase' | 'serverStatus' | 'error' | 'statusMessage'>
): Partial<EngineeringCadState> {
  const phase = patch.phase ?? current?.phase ?? 'idle';
  const serverStatus = patch.serverStatus ?? current?.serverStatus ?? null;
  const error = patch.error !== undefined ? patch.error : (current?.error ?? null);
  const statusMessage =
    patch.statusMessage !== undefined ? patch.statusMessage : (current?.statusMessage ?? null);
  return {
    ...patch,
    cadBusy: phase === 'submitting' || phase === 'processing',
    cadStatus: serverStatus,
    cadError: error,
    generateMessage: statusMessage,
  };
}

function resetJobFields(): Partial<EngineeringCadState> {
  return syncLegacyFields({
    phase: 'idle',
    jobId: null,
    serverStatus: null,
    stlUrl: null,
    stlFileName: null,
    scadContent: null,
    dimensions: null,
    meshTaskId: null,
    cadTitle: null,
    error: null,
    statusMessage: null,
    downloadMessage: null,
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
  scadContent: null,
  dimensions: null,
  meshTaskId: null,
  cadTitle: null,
  error: null,
  statusMessage: null,
  downloadMessage: null,
  retryCount: 0,
  lastPlan: null,

  cadBusy: false,
  cadStatus: null,
  cadError: null,
  generateMessage: null,

  clearCadJob: () => {
    stopPolling();
    abortSubmit();
    patch(resetJobFields());
    log('cleared');
  },

  clearCadPreview: () => {
    get().clearCadJob();
  },

  cancelCadJob: async () => {
    const { jobId } = get();
    stopPolling();
    abortSubmit();
    if (jobId && window.caval?.cad?.cancelJob) {
      const userIdResult = await window.caval.billingUserId?.();
      void window.caval.cad.cancelJob({
        jobId,
        cavalId: userIdResult?.userId,
      });
    }
    patch({
      phase: 'cancelled',
      serverStatus: 'cancelled',
      error: null,
      statusMessage: 'Generare CAD anulată.',
    });
    log('cancelled', jobId);
  },

  stopPoll: () => {
    get().cancelCadJob();
  },

  downloadStl: async () => {
    const { stlUrl, stlFileName } = get();
    if (!stlUrl || !window.caval?.cad?.downloadStl) {
      return { ok: false, error: 'Niciun STL disponibil.' };
    }
    const result = await window.caval.cad.downloadStl({
      url: stlUrl,
      defaultName: stlFileName ?? 'model.stl',
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
        patch({
          serverStatus: status,
          phase,
          stlUrl: job.stlUrl ?? get().stlUrl,
          scadContent: job.scad ?? get().scadContent,
          dimensions: job.dimensions ?? get().dimensions,
          meshTaskId: job.meshTaskId ?? get().meshTaskId,
          error: status === 'failed' ? normalizeCadErrorMessage(job.error ?? 'Generarea modelului a eșuat.') : null,
          statusMessage:
            status === 'done' && job.stlUrl
              ? 'Model STL generat — vezi preview în centru.'
              : get().statusMessage,
        });

        if (isTerminalStatus(status)) {
          stopPolling();
          log('poll terminal', { jobId, status });
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

    get().clearCadJob();
    submitAbort = new AbortController();

    const { project, userPrompt } = plan;
    const primaryStl = project.build.find((b) => b.kind === 'stl');
    const aiState = useAIStore.getState();
    const editorState = useEditorStore.getState();
    const modelId = plan.modelId ?? aiState.selectedModel ?? 'caval-auto/free';
    const resolvedModel = await resolveCadModel(modelId);

    const technicalPrompt = buildCadTechnicalPrompt(project, userPrompt);
    const workspaceRoot = plan.projectPath ?? editorState.projectPath;

    try {
      assertRendererChatAllowed({
        prompt: technicalPrompt,
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
      statusMessage: 'Planificare CAD pe server cloud…',
      downloadMessage: null,
      stlFileName: primaryStl?.name ?? 'model.stl',
      cadTitle: primaryStl?.name ?? project.spec.title,
      lastPlan: plan,
      retryCount: 0,
    });

    await warmCadPipeline(resolvedModel, workspaceRoot);

    const credentials = await loadCadCredentials();
    const conversationHistory: CadChatMessage[] = plan.conversationHistory?.length
      ? plan.conversationHistory
      : aiState.messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.content.slice(0, 4_000) }));

    const attachmentBlock = (plan.attachments ?? aiState.attachedFiles)
      .slice(0, 4)
      .map((f) => `[${f.name}]\n${f.content.slice(0, 2_000)}`)
      .join('\n\n');
    const planMessages: CadChatMessage[] = [
      ...conversationHistory,
      {
        role: 'user',
        content: attachmentBlock
          ? `${technicalPrompt}\n\n<<ATTACHMENTS>>\n${attachmentBlock}`
          : technicalPrompt,
      },
    ];

    if (submitAbort.signal.aborted) return;

    let planResult;
    try {
      planResult = await cad.plan({
        messages: planMessages,
        latestUserText: technicalPrompt,
        openRouterApiKey: credentials.openRouterApiKey,
        meshApiKey: credentials.meshApiKey,
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
    if (pipeline === 'mesh' && !credentials.meshApiKey) {
      patch({
        phase: 'failed',
        error:
          planWarnings.join(' ') ||
          'Pentru obiecte 3D libere (dulap, figurine, carcase) adaugă cheia Meshy în Setări (mesh.apiKey). Alternativ instalează OpenSCAD pentru piese mecanice precise.',
      });
      return;
    }

    const userIdResult = await caval.billingUserId?.();
    const projectType = inferCadProjectType(userPrompt, project.spec);
    const jobPrompt = planResult.plan.technicalPrompt || technicalPrompt;

    let created;
    let createAttempt = 0;
    while (createAttempt < MAX_CREATE_RETRIES) {
      if (submitAbort.signal.aborted) return;
      try {
        created = await cad.createJob({
          prompt: jobPrompt,
          projectType,
          cavalId: userIdResult?.userId,
          openRouterApiKey: credentials.openRouterApiKey,
          meshApiKey: credentials.meshApiKey,
          constraints: mapEngProjectToConstraints(project.spec) as Record<string, string | undefined>,
          planContext: mapEngProjectToPlanContext(project),
          conversationHistory: planMessages,
          previousScad: plan.previousScad,
          previousMeshTaskId: plan.previousMeshTaskId,
          generationMode: planResult.plan.pipeline,
          meshPrompt: planResult.plan.pipeline === 'mesh' ? jobPrompt : undefined,
          quality: 'standard',
        });
        if (created.ok && created.jobId) break;
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

    if (submitAbort.signal.aborted) return;

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
    patch({
      phase: 'processing',
      jobId,
      serverStatus: status,
      meshTaskId,
      statusMessage:
        planWarnings.length > 0
          ? planWarnings.join(' · ')
          : pipeline === 'mesh'
            ? 'Generez model 3D din text pe cloud (Meshy)…'
            : 'Generez STL pe server cloud (OpenSCAD)…',
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
  };
});
