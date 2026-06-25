import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CavalStreamChunk } from '../../main/preload';
import {
  buildEngineeringPrompt,
  buildCadPrompt,
  buildCadPlanContext,
  bomToCsv,
  circuitToStructuredJson,
  parseEngineeringPlan,
  planToMarkdown,
  type EngineeringConstraints,
  type EngineeringProjectType,
  type ParsedEngineeringPlan,
} from '../components/engineering/engineering-format';
import type { SchematicGraph } from '../../../ai/schematic/schematic-types';
import { validateSchematicGraph } from '../../../ai/schematic/schematic-types';

export type CadJobStatus = 'queued' | 'generating' | 'rendering' | 'done' | 'failed';

export interface CadJobState {
  id: string;
  status: CadJobStatus;
  stlUrl: string | null;
  scad: string | null;
  error: string | null;
}

export interface CadJobRecord extends CadJobState {
  prompt: string;
  projectType: EngineeringProjectType;
  createdAt: number;
}

export interface EngineeringPlanRecord {
  id: string;
  title: string;
  prompt: string;
  projectType: EngineeringProjectType;
  constraints: EngineeringConstraints;
  rawMarkdown: string;
  parsed: ParsedEngineeringPlan;
  createdAt: number;
}

interface EngineeringStore {
  prompt: string;
  projectType: EngineeringProjectType;
  constraints: EngineeringConstraints;
  isGenerating: boolean;
  streamText: string;
  error: string | null;
  lastPlan: EngineeringPlanRecord | null;
  history: EngineeringPlanRecord[];
  cadJob: CadJobState | null;
  isCadGenerating: boolean;
  cadHistory: CadJobRecord[];
  schematicGraph: SchematicGraph | null;
  schematicError: string | null;
  isSchematicGenerating: boolean;
  schematicExplanation: string | null;

  setPrompt: (v: string) => void;
  setProjectType: (v: EngineeringProjectType) => void;
  setConstraints: (patch: Partial<EngineeringConstraints>) => void;
  generatePlan: () => Promise<void>;
  stopGeneration: () => void;
  clearResult: () => void;
  exportBomCsv: () => Promise<{ ok: boolean; error?: string }>;
  exportMarkdown: () => Promise<{ ok: boolean; error?: string }>;
  exportCircuitJson: () => Promise<{ ok: boolean; error?: string }>;
  exportPdf: () => Promise<{ ok: boolean; error?: string }>;
  generateCadModel: () => Promise<void>;
  stopCadPolling: () => void;
  downloadCadStl: () => Promise<{ ok: boolean; error?: string }>;
  generateSchematicFromCode: () => Promise<void>;
  generateCodeFromSchematic: () => Promise<void>;
  explainSchematicSelection: (nodeId?: string, edgeId?: string) => Promise<void>;
  analyzeSchematic: () => Promise<void>;
}

const DEFAULT_CONSTRAINTS: EngineeringConstraints = {
  budget: '',
  dimensions: '',
  voltage: '',
  autonomy: '',
  weight: '',
  skillLevel: 'beginner',
};

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function planTitle(prompt: string, projectType: EngineeringProjectType): string {
  const trimmed = prompt.trim().slice(0, 60);
  return trimmed || `Hardware Plan — ${projectType}`;
}

let streamCleanup: (() => void) | null = null;
let cadPollTimer: ReturnType<typeof setInterval> | null = null;
let cadPollStartedAt = 0;

const CAD_POLL_MS = 2000;
const CAD_POLL_MAX_MS = 120_000;

const getCaval = () => window.caval as typeof window.caval & {
  chatStream?: (
    request: {
      message: string;
      model: string;
      mode?: string;
      streamId: string;
      context?: Record<string, unknown>;
    },
    onChunk: (chunk: CavalStreamChunk) => void
  ) => () => void;
  engineeringExportPdf?: (input: { content: string; defaultName?: string }) => Promise<{
    ok: boolean;
    canceled?: boolean;
    path?: string;
    error?: string;
  }>;
  billingUserId?: () => Promise<{ ok: boolean; userId?: string }>;
  settingsLoad?: () => Promise<{ ok: boolean; settings?: Record<string, string> }>;
  secretsGet?: () => Promise<{ ok: boolean; secrets?: Record<string, string> }>;
  cad?: {
    createJob: (input: {
      prompt: string;
      projectType?: string;
      constraints?: Record<string, string | undefined>;
      cavalId?: string;
      planContext?: {
        requirements?: string;
        assembly?: string;
        bom?: string;
        performance?: string;
      };
      openRouterApiKey?: string;
    }) => Promise<{ ok: boolean; jobId?: string; status?: string; error?: string }>;
    getJob: (jobId: string) => Promise<{
      ok: boolean;
      jobId?: string;
      status?: CadJobStatus;
      stlUrl?: string | null;
      scad?: string | null;
      error?: string | null;
    }>;
    downloadStl: (input: { url: string; defaultName?: string }) => Promise<{
      ok: boolean;
      canceled?: boolean;
      path?: string;
      error?: string;
    }>;
  };
  schematic?: {
    generateFromCode: (input: {
      workspaceRoot: string;
      files?: string[];
      objective?: string;
      useSample?: boolean;
    }) => Promise<{ ok: boolean; graph?: SchematicGraph; error?: string }>;
    generateCode: (input: {
      workspaceRoot: string;
      graph: SchematicGraph;
      delta: Record<string, unknown>;
      skipSuggestions?: boolean;
    }) => Promise<{
      ok: boolean;
      patchSet?: { summary: string; files: Array<{ path: string; patch: string }> };
      composerPhase?: string;
      error?: string;
    }>;
    explain: (input: {
      graph: SchematicGraph;
      nodeId?: string;
      edgeId?: string;
    }) => Promise<{ ok: boolean; content?: string; error?: string }>;
    analyze: (input: { graph: SchematicGraph }) => Promise<{
      ok: boolean;
      issues?: Array<{ id: string; severity: string; kind: string; message: string }>;
      error?: string;
    }>;
  };
};

export const useEngineeringStore = create<EngineeringStore>()(
  persist(
    (set, get) => ({
      prompt: '',
      projectType: 'custom',
      constraints: { ...DEFAULT_CONSTRAINTS },
      isGenerating: false,
      streamText: '',
      error: null,
      lastPlan: null,
      history: [],
      cadJob: null,
      isCadGenerating: false,
      cadHistory: [],
      schematicGraph: null,
      schematicError: null,
      isSchematicGenerating: false,
      schematicExplanation: null,

      setPrompt: (v) => set({ prompt: v }),
      setProjectType: (v) => set({ projectType: v }),
      setConstraints: (patch) =>
        set((s) => ({ constraints: { ...s.constraints, ...patch } })),

      generatePlan: async () => {
        const { prompt, projectType, constraints } = get();
        if (!prompt.trim()) {
          set({ error: 'Descrie proiectul hardware înainte de generare.' });
          return;
        }

        streamCleanup?.();
        streamCleanup = null;

        const message = buildEngineeringPrompt({ prompt, projectType, constraints });
        const streamId = generateId();
        let fullContent = '';

        set({ isGenerating: true, streamText: '', error: null });

        const caval = getCaval();
        if (!caval?.chatStream) {
          set({
            isGenerating: false,
            error: 'AI streaming indisponibil. Repornește aplicația.',
          });
          return;
        }

        streamCleanup = caval.chatStream(
          {
            message,
            model: 'caval-auto/free',
            mode: 'ask',
            streamId,
          },
          (chunk: CavalStreamChunk) => {
            if (chunk.type === 'delta' && chunk.delta) {
              fullContent += chunk.delta;
              set({ streamText: fullContent });
            }
            if (chunk.type === 'error') {
              set({
                isGenerating: false,
                error: chunk.error ?? 'Eroare necunoscută la generare.',
              });
              streamCleanup?.();
              streamCleanup = null;
            }
            if (chunk.type === 'done') {
              const parsed = parseEngineeringPlan(fullContent);
              const record: EngineeringPlanRecord = {
                id: generateId(),
                title: planTitle(prompt, projectType),
                prompt,
                projectType,
                constraints: { ...constraints },
                rawMarkdown: fullContent,
                parsed,
                createdAt: Date.now(),
              };
              set((s) => ({
                isGenerating: false,
                streamText: fullContent,
                lastPlan: record,
                history: [record, ...s.history].slice(0, 20),
              }));
              streamCleanup?.();
              streamCleanup = null;
            }
          }
        );
      },

      stopGeneration: () => {
        streamCleanup?.();
        streamCleanup = null;
        set({ isGenerating: false });
      },

      clearResult: () => set({ streamText: '', error: null, lastPlan: null }),

      exportBomCsv: async () => {
        const plan = get().lastPlan;
        if (!plan) return { ok: false, error: 'Niciun plan generat.' };
        const csv = bomToCsv(plan.parsed.bomRows);
        const content = plan.parsed.bomRows.length > 0
          ? csv
          : `Name,Part/Code,Qty,Role,Notes\n"No BOM table parsed","See markdown","","",""`;
        const result = await window.caval?.saveFile?.({
          content,
          saveAs: true,
          path: `${plan.title.replace(/[^\w\-]+/g, '_')}-bom.csv`,
        });
        if (result?.canceled) return { ok: false, error: 'Export anulat.' };
        return { ok: true };
      },

      exportMarkdown: async () => {
        const plan = get().lastPlan;
        if (!plan) return { ok: false, error: 'Niciun plan generat.' };
        const md = planToMarkdown(plan.parsed, plan.title);
        const result = await window.caval?.saveFile?.({
          content: md,
          saveAs: true,
          path: `${plan.title.replace(/[^\w\-]+/g, '_')}.md`,
        });
        if (result?.canceled) return { ok: false, error: 'Export anulat.' };
        return { ok: true };
      },

      exportCircuitJson: async () => {
        const plan = get().lastPlan;
        if (!plan) return { ok: false, error: 'Niciun plan generat.' };
        const json = circuitToStructuredJson(plan.parsed.sections);
        const result = await window.caval?.saveFile?.({
          content: json,
          saveAs: true,
          path: `${plan.title.replace(/[^\w\-]+/g, '_')}-circuit.json`,
        });
        if (result?.canceled) return { ok: false, error: 'Export anulat.' };
        return { ok: true };
      },

      exportPdf: async () => {
        const plan = get().lastPlan;
        if (!plan) return { ok: false, error: 'Niciun plan generat.' };
        const md = planToMarkdown(plan.parsed, plan.title);
        const caval = getCaval();
        if (!caval?.engineeringExportPdf) {
          return { ok: false, error: 'Export PDF indisponibil.' };
        }
        const result = await caval.engineeringExportPdf({
          content: md,
          defaultName: `${plan.title.replace(/[^\w\-]+/g, '_')}.pdf`,
        });
        if (result.canceled) return { ok: false, error: 'Export anulat.' };
        if (!result.ok) return { ok: false, error: result.error ?? 'Export PDF eșuat.' };
        return { ok: true };
      },

      stopCadPolling: () => {
        if (cadPollTimer) {
          clearInterval(cadPollTimer);
          cadPollTimer = null;
        }
        set({ isCadGenerating: false });
      },

      generateCadModel: async () => {
        const { prompt, projectType, constraints, lastPlan } = get();
        if (!prompt.trim()) {
          set({ error: 'Descrie piesa înainte de generarea modelului 3D.' });
          return;
        }

        const caval = getCaval();
        if (!caval?.cad?.createJob) {
          set({ error: 'CAD API indisponibil. Pornește serviciul cad:serve sau configurează CAD_API_URL.' });
          return;
        }

        get().stopCadPolling();
        set({
          isCadGenerating: true,
          error: null,
          cadJob: null,
        });

        const planSections = lastPlan?.parsed.sections;
        const cadPrompt = buildCadPrompt({
          prompt,
          projectType,
          constraints,
          planSections,
        });
        const planContext = buildCadPlanContext(planSections);

        const userIdResult = await caval.billingUserId?.();
        const cavalId = userIdResult?.userId;

        const settingsResult = await caval.settingsLoad?.();
        const secretsResult = await caval.secretsGet?.();
        const openRouterApiKey =
          settingsResult?.settings?.['openrouter.apiKey'] ||
          secretsResult?.secrets?.OPENROUTER_API_KEY;

        const created = await caval.cad.createJob({
          prompt: cadPrompt,
          projectType,
          constraints: {
            budget: constraints.budget,
            dimensions: constraints.dimensions,
            voltage: constraints.voltage,
            autonomy: constraints.autonomy,
            weight: constraints.weight,
            skillLevel: constraints.skillLevel,
          },
          cavalId,
          planContext,
          openRouterApiKey: openRouterApiKey || undefined,
        });

        if (!created.ok || !created.jobId) {
          set({
            isCadGenerating: false,
            error: created.error ?? 'Nu am putut crea job-ul CAD.',
          });
          return;
        }

        const jobId = created.jobId;
        set({
          cadJob: {
            id: jobId,
            status: (created.status as CadJobStatus) ?? 'queued',
            stlUrl: null,
            scad: null,
            error: null,
          },
        });

        cadPollStartedAt = Date.now();

        const pollOnce = async () => {
          if (Date.now() - cadPollStartedAt > CAD_POLL_MAX_MS) {
            get().stopCadPolling();
            set((s) => ({
              error: 'Timeout la generarea modelului CAD (2 min).',
              cadJob: s.cadJob
                ? { ...s.cadJob, status: 'failed', error: 'Timeout' }
                : null,
            }));
            return;
          }

          const job = await caval.cad!.getJob(jobId);
          if (!job.ok) {
            get().stopCadPolling();
            set({ error: job.error ?? 'Eroare la polling CAD.' });
            return;
          }

          const status = (job.status ?? 'queued') as CadJobStatus;
          const nextJob: CadJobState = {
            id: jobId,
            status,
            stlUrl: job.stlUrl ?? null,
            scad: job.scad ?? null,
            error: job.error ?? null,
          };

          set({ cadJob: nextJob });

          if (status === 'done' || status === 'failed') {
            get().stopCadPolling();
            if (status === 'done') {
              const record: CadJobRecord = {
                ...nextJob,
                prompt,
                projectType,
                createdAt: Date.now(),
              };
              set((s) => ({
                cadHistory: [record, ...s.cadHistory].slice(0, 10),
                error:
                  job.error &&
                  (/fallback|mock|MOCK|repair/i.test(job.error) ? job.error : s.error),
              }));
            } else {
              set({ error: job.error ?? 'Generarea modelului CAD a eșuat.' });
            }
          }
        };

        await pollOnce();
        cadPollTimer = setInterval(() => {
          void pollOnce();
        }, CAD_POLL_MS);
      },

      downloadCadStl: async () => {
        const { cadJob, prompt } = get();
        if (!cadJob?.stlUrl) return { ok: false, error: 'Niciun STL disponibil.' };
        const caval = getCaval();
        if (!caval?.cad?.downloadStl) {
          return { ok: false, error: 'Download STL indisponibil.' };
        }
        const name = `${prompt.trim().slice(0, 40).replace(/[^\w\-]+/g, '_') || 'model'}.stl`;
        const result = await caval.cad.downloadStl({ url: cadJob.stlUrl, defaultName: name });
        if (result.canceled) return { ok: false, error: 'Export anulat.' };
        if (!result.ok) return { ok: false, error: result.error ?? 'Download eșuat.' };
        return { ok: true };
      },

      generateSchematicFromCode: async () => {
        const { prompt } = get();
        const caval = getCaval();
        if (!caval?.schematic?.generateFromCode) {
          set({ schematicError: 'Schematic API indisponibil.' });
          return;
        }

        set({ isSchematicGenerating: true, schematicError: null });
        try {
          const result = await caval.schematic.generateFromCode({
            workspaceRoot: '.',
            objective: prompt.trim() || 'Generate system schematic from workspace code',
          });
          if (!result.ok || !result.graph || !validateSchematicGraph(result.graph)) {
            set({
              isSchematicGenerating: false,
              schematicError: result.error ?? 'Nu am putut genera schematicul.',
            });
            return;
          }
          set({
            isSchematicGenerating: false,
            schematicGraph: result.graph,
            schematicError: null,
          });
        } catch (error) {
          set({
            isSchematicGenerating: false,
            schematicError: error instanceof Error ? error.message : String(error),
          });
        }
      },

      generateCodeFromSchematic: async () => {
        const { schematicGraph } = get();
        const caval = getCaval();
        if (!schematicGraph) {
          set({ schematicError: 'Niciun schematic de exportat.' });
          return;
        }
        if (!caval?.schematic?.generateCode) {
          set({ schematicError: 'Schematic API indisponibil.' });
          return;
        }

        set({ isSchematicGenerating: true, schematicError: null });
        try {
          const delta = {
            addedNodes: schematicGraph.nodes,
            removedNodeIds: [] as string[],
            updatedNodes: [] as SchematicGraph['nodes'],
            addedEdges: schematicGraph.edges,
            removedEdgeIds: [] as string[],
            updatedEdges: [] as SchematicGraph['edges'],
          };

          const result = await caval.schematic.generateCode({
            workspaceRoot: '.',
            graph: schematicGraph,
            delta,
            skipSuggestions: false,
          });

          if (!result.ok) {
            set({
              isSchematicGenerating: false,
              schematicError: result.error ?? 'Generarea codului a eșuat.',
            });
            return;
          }

          set({
            isSchematicGenerating: false,
            schematicError: null,
          });

          if (result.composerPhase === 'awaiting_review' || result.composerPhase === 'awaiting_suggestions') {
            set({
              schematicExplanation:
                result.composerPhase === 'awaiting_suggestions'
                  ? 'Patch-urile sunt în AI Suggestions Before Review. Deschide Composer pentru a continua.'
                  : 'Patch-urile sunt în Code Review Panel. Deschide Composer pentru a revizui.',
            });
          }
        } catch (error) {
          set({
            isSchematicGenerating: false,
            schematicError: error instanceof Error ? error.message : String(error),
          });
        }
      },

      explainSchematicSelection: async (nodeId?: string, edgeId?: string) => {
        const { schematicGraph } = get();
        const caval = getCaval();
        if (!schematicGraph || !caval?.schematic?.explain) return;

        set({ isSchematicGenerating: true });
        try {
          const result = await caval.schematic.explain({
            graph: schematicGraph,
            nodeId,
            edgeId,
          });
          set({
            isSchematicGenerating: false,
            schematicExplanation: result.content ?? result.error ?? null,
          });
        } catch (error) {
          set({
            isSchematicGenerating: false,
            schematicError: error instanceof Error ? error.message : String(error),
          });
        }
      },

      analyzeSchematic: async () => {
        const { schematicGraph } = get();
        const caval = getCaval();
        if (!schematicGraph || !caval?.schematic?.analyze) return;

        set({ isSchematicGenerating: true });
        try {
          const result = await caval.schematic.analyze({ graph: schematicGraph });
          const summary =
            result.issues?.map((i) => `[${i.severity}] ${i.message}`).join('\n') ??
            'Nicio problemă detectată.';
          set({
            isSchematicGenerating: false,
            schematicExplanation: summary,
          });
        } catch (error) {
          set({
            isSchematicGenerating: false,
            schematicError: error instanceof Error ? error.message : String(error),
          });
        }
      },
    }),
    {
      name: 'caval-engineering-store',
      partialize: (s) => ({
        prompt: s.prompt,
        projectType: s.projectType,
        constraints: s.constraints,
        history: s.history.slice(0, 10),
        lastPlan: s.lastPlan,
        cadHistory: s.cadHistory.slice(0, 5),
        cadJob: s.cadJob,
        schematicGraph: s.schematicGraph,
      }),
    }
  )
);
