import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CadJobStatus } from './engineering-store';
import {
  buildConversationHistory,
  composePrint3DPrompt,
  findPreviousScad,
  buildClarifyMessage,
  type Print3DPlannerResult,
} from './print3d-prompt';
import { exampleChips, t, type Print3DLanguage } from './print3d-i18n';

export type Print3DQuality = 'standard' | 'high';
export type Print3DGenerationMode = 'openscad' | 'mesh';
export type Print3DMessageKind = 'consultation' | 'generation';

export interface Print3DMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  kind?: Print3DMessageKind;
  quickReplies?: string[];
  jobId?: string;
  stlUrl?: string | null;
  scad?: string | null;
  meshTaskId?: string | null;
  generationMode?: Print3DGenerationMode | null;
  status?: CadJobStatus;
  dimensions?: { x: number; y: number; z: number } | null;
  error?: string | null;
  createdAt: number;
}

export interface Print3DViewerState {
  stlUrl: string | null;
  scad: string | null;
  dimensions: { x: number; y: number; z: number } | null;
  status: CadJobStatus | null;
  error: string | null;
  generationMode: Print3DGenerationMode | null;
}

interface Print3DStore {
  messages: Print3DMessage[];
  input: string;
  quality: Print3DQuality;
  userLanguage: Print3DLanguage;
  isGenerating: boolean;
  isPlanning: boolean;
  viewer: Print3DViewerState;

  setInput: (v: string) => void;
  setQuality: (q: Print3DQuality) => void;
  sendMessage: (text?: string) => Promise<void>;
  stopGeneration: () => void;
  clearChat: () => void;
  downloadStl: () => Promise<{ ok: boolean; error?: string }>;
  exportScad: () => Promise<{ ok: boolean; error?: string }>;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const emptyViewer = (): Print3DViewerState => ({
  stlUrl: null,
  scad: null,
  dimensions: null,
  status: null,
  error: null,
  generationMode: null,
});

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollStartedAt = 0;
const POLL_MS = 2000;
const POLL_MAX_MS = 300_000;

async function getOpenRouterApiKey(): Promise<string | undefined> {
  const settingsResult = await window.caval?.settingsLoad?.();
  const secretsResult = await window.caval?.secretsGet?.();
  return (
    settingsResult?.settings?.['openrouter.apiKey'] ||
    secretsResult?.secrets?.OPENROUTER_API_KEY ||
    undefined
  );
}

async function getMeshApiKey(): Promise<string | undefined> {
  const settingsResult = await window.caval?.settingsLoad?.();
  const secretsResult = await window.caval?.secretsGet?.();
  return (
    settingsResult?.settings?.['mesh.apiKey'] ||
    secretsResult?.secrets?.MESHY_API_KEY ||
    undefined
  );
}

function findPreviousMeshTaskId(messages: Print3DMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const id = messages[i]?.meshTaskId?.trim();
    if (id) return id;
  }
  return undefined;
}

function generationStatusMessage(
  lang: Print3DLanguage,
  mode: Print3DGenerationMode
): string {
  return mode === 'mesh'
    ? lang === 'ro'
      ? 'Generez mesh 3D…'
      : 'Generating 3D mesh…'
    : lang === 'ro'
      ? 'Generez modelul STL…'
      : 'Generating STL model…';
}

function doneMessage(
  lang: Print3DLanguage,
  mode: Print3DGenerationMode,
  dims?: { x: number; y: number; z: number } | null
): string {
  const dimText = dims
    ? lang === 'ro'
      ? ` ${t('dimensions', lang)}: ${dims.x}×${dims.y}×${dims.z} mm.`
      : ` ${t('dimensions', lang)}: ${dims.x}×${dims.y}×${dims.z} mm.`
    : '';
  const meshNote =
    mode === 'mesh' ? `\n${t('meshOverhangNote', lang)}` : '';
  return `${t('stlReady', lang)}${dimText}${t('stlReadyRefine', lang)}${meshNote}`;
}

export const usePrint3DStore = create<Print3DStore>()(
  persist(
    (set, get) => ({
      messages: [],
      input: '',
      quality: 'standard',
      userLanguage: 'ro',
      isGenerating: false,
      isPlanning: false,
      viewer: emptyViewer(),

      setInput: (v) => set({ input: v }),
      setQuality: (q) => set({ quality: q }),

      stopGeneration: () => {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        set({ isGenerating: false, isPlanning: false });
      },

      clearChat: () => {
        get().stopGeneration();
        set({ messages: [], input: '', viewer: emptyViewer() });
      },

      sendMessage: async (text) => {
        const userText = (text ?? get().input).trim();
        if (!userText) return;

        const caval = window.caval;
        if (!caval?.cad?.createJob || !caval?.cad?.plan) {
          set({
            viewer: {
              ...get().viewer,
              error: 'CAD API indisponibil. Configurează CAD_API_URL.',
            },
          });
          return;
        }

        get().stopGeneration();

        const userMsg: Print3DMessage = {
          id: generateId(),
          role: 'user',
          content: userText,
          createdAt: Date.now(),
        };

        const priorMessages = get().messages;
        const chatForPlan = [...priorMessages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        set({
          input: '',
          isPlanning: true,
          messages: [...priorMessages, userMsg],
        });

        const openRouterApiKey = await getOpenRouterApiKey();
        const previousMeshTaskId = findPreviousMeshTaskId(priorMessages);

        const planResult = await caval.cad.plan({
          messages: chatForPlan,
          latestUserText: userText,
          openRouterApiKey: openRouterApiKey || undefined,
          previousMeshTaskId,
        });

        if (!planResult.ok || !planResult.plan) {
          set({
            isPlanning: false,
            messages: [
              ...get().messages,
              {
                id: generateId(),
                role: 'assistant',
                kind: 'consultation',
                content: planResult.error ?? 'Planner indisponibil.',
                createdAt: Date.now(),
              },
            ],
            viewer: {
              ...get().viewer,
              error: planResult.error ?? 'Planner indisponibil.',
            },
          });
          return;
        }

        const plan = planResult.plan as Print3DPlannerResult;
        const lang = plan.userLanguage;
        set({ userLanguage: lang, isPlanning: false });

        if (plan.action === 'clarify') {
          set({
            messages: [
              ...get().messages,
              {
                id: generateId(),
                role: 'assistant',
                kind: 'consultation',
                content: buildClarifyMessage(plan),
                quickReplies: plan.quickReplies,
                createdAt: Date.now(),
              },
            ],
          });
          return;
        }

        const generationMode: Print3DGenerationMode =
          plan.pipeline === 'mesh' ? 'mesh' : 'openscad';
        const assistantId = generateId();
        const chatForPrompt = chatForPlan;
        const conversationHistory = buildConversationHistory(chatForPrompt);
        const previousScad = findPreviousScad(priorMessages);
        const cadPrompt = composePrint3DPrompt(chatForPrompt, plan.technicalPrompt);

        set({
          isGenerating: true,
          messages: [
            ...get().messages,
            {
              id: assistantId,
              role: 'assistant',
              kind: 'generation',
              content: generationStatusMessage(lang, generationMode),
              status: 'queued',
              generationMode,
              createdAt: Date.now(),
            },
          ],
          viewer: {
            stlUrl: null,
            scad: null,
            dimensions: null,
            status: 'queued',
            error: null,
            generationMode,
          },
        });

        const meshApiKey = await getMeshApiKey();
        const userIdResult = await caval.billingUserId?.();

        const created = await caval.cad.createJob({
          prompt: cadPrompt,
          projectType: 'custom',
          cavalId: userIdResult?.userId,
          openRouterApiKey: openRouterApiKey || undefined,
          meshApiKey: meshApiKey || undefined,
          quality: get().quality,
          conversationHistory,
          previousScad: generationMode === 'openscad' ? previousScad : undefined,
          generationMode,
          meshPrompt: generationMode === 'mesh' ? plan.technicalPrompt : undefined,
          previousMeshTaskId:
            generationMode === 'mesh' ? previousMeshTaskId : undefined,
        });

        if (!created.ok || !created.jobId) {
          set((s) => ({
            isGenerating: false,
            messages: s.messages.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: created.error ?? 'Nu am putut crea job-ul CAD.',
                    status: 'failed' as CadJobStatus,
                    error: created.error ?? 'Job creation failed',
                  }
                : m
            ),
            viewer: {
              ...s.viewer,
              status: 'failed',
              error: created.error ?? 'Nu am putut crea job-ul CAD.',
            },
          }));
          return;
        }

        const jobId = created.jobId;
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantId ? { ...m, jobId, status: 'generating' as CadJobStatus } : m
          ),
          viewer: { ...s.viewer, status: 'generating' },
        }));

        pollStartedAt = Date.now();

        const finishJob = (update: Partial<Print3DMessage>, viewer: Partial<Print3DViewerState>) => {
          get().stopGeneration();
          set((s) => ({
            messages: s.messages.map((m) => (m.id === assistantId ? { ...m, ...update } : m)),
            viewer: { ...s.viewer, ...viewer },
          }));
        };

        const pollOnce = async () => {
          if (Date.now() - pollStartedAt > POLL_MAX_MS) {
            finishJob(
              {
                content: lang === 'ro' ? 'Timeout la generare (5 min).' : 'Generation timeout (5 min).',
                status: 'failed',
                error: 'Timeout',
              },
              {
                status: 'failed',
                error: lang === 'ro' ? 'Timeout la generare (5 min).' : 'Generation timeout (5 min).',
              }
            );
            return;
          }

          const job = await caval.cad!.getJob(jobId);
          if (!job.ok) {
            finishJob(
              { content: job.error ?? 'Eroare CAD.', status: 'failed', error: job.error },
              { status: 'failed', error: job.error ?? 'Eroare CAD.' }
            );
            return;
          }

          const status = (job.status ?? 'queued') as CadJobStatus;
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    status,
                    stlUrl: job.stlUrl,
                    scad: job.scad,
                    meshTaskId: job.meshTaskId,
                    dimensions: job.dimensions,
                    error: job.error,
                  }
                : m
            ),
            viewer: {
              stlUrl: job.stlUrl ?? null,
              scad: job.scad ?? null,
              dimensions: job.dimensions ?? null,
              status,
              error: job.error ?? null,
              generationMode,
            },
          }));

          if (status === 'done') {
            get().stopGeneration();
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: doneMessage(lang, generationMode, job.dimensions),
                      status: 'done',
                      stlUrl: job.stlUrl,
                      scad: job.scad,
                      meshTaskId: job.meshTaskId,
                      dimensions: job.dimensions,
                      error: job.error,
                    }
                  : m
              ),
            }));
            return;
          }

          if (status === 'failed') {
            finishJob(
              {
                content: job.error ?? (lang === 'ro' ? 'Generarea a eșuat.' : 'Generation failed.'),
                status: 'failed',
                error: job.error,
              },
              {
                status: 'failed',
                error: job.error ?? (lang === 'ro' ? 'Generarea a eșuat.' : 'Generation failed.'),
              }
            );
          }
        };

        await pollOnce();
        if (get().isGenerating) {
          pollTimer = setInterval(() => void pollOnce(), POLL_MS);
        }
      },

      downloadStl: async () => {
        const { viewer } = get();
        if (!viewer.stlUrl) return { ok: false, error: 'Niciun STL disponibil.' };
        const result = await window.caval?.cad?.downloadStl?.({
          url: viewer.stlUrl,
          defaultName: 'print3d-model.stl',
        });
        if (result?.canceled) return { ok: false, error: 'Export anulat.' };
        if (!result?.ok) return { ok: false, error: result?.error ?? 'Download eșuat.' };
        return { ok: true };
      },

      exportScad: async () => {
        const { viewer } = get();
        if (!viewer.scad || viewer.generationMode === 'mesh') {
          return { ok: false, error: 'OpenSCAD export is only available for parametric models.' };
        }
        const result = await window.caval?.cad?.downloadScad?.({
          content: viewer.scad,
          defaultName: 'print3d-model.scad',
        });
        if (result?.canceled) return { ok: false, error: 'Export canceled.' };
        if (!result?.ok) return { ok: false, error: result?.error ?? 'Export failed.' };
        return { ok: true };
      },
    }),
    {
      name: 'caval-print3d-store',
      partialize: (s) => ({
        messages: s.messages.slice(-30),
        quality: s.quality,
        userLanguage: s.userLanguage,
      }),
    }
  )
);

export { exampleChips };
