/**
 * CAVALO Fast Pipeline — registry și rezolvare mod pipeline.
 * Modulul există mereu; runtime-pipeline folosește fastPipeline din caval.jsonc
 * (sau Review strict din UI → full pipeline cu Merge + Supervisor).
 */

export const FAST_PIPELINE_ENTRYPOINTS = {
  electron: 'src/main/electron-main.ts',
  preload: 'src/main/preload.ts',
  runtime: 'src/caval-runtime.ts',
  composer: 'ai/composer/',
  contextEngine: ['context-engine/', 'ai/context/'] as const,
  pipeline: 'ai/pipeline/',
} as const;

export const FAST_PIPELINE_MODULES = [
  'ai/pipeline/model-completion.ts',
  'ai/pipeline/tool-agent-loop.ts',
  'ai/pipeline/pipeline-event-bus.ts',
  'ai/pipeline/fast-pipeline.ts',
] as const;

export type FastPipelineMode = 'fast' | 'full';

export interface FastPipelineOptions {
  /** UI Review strict — forțează Merge + Supervisor LLM */
  strictReview?: boolean;
  /** Valoare din caval.jsonc multiAgent.fastPipeline */
  configFastPipeline?: boolean;
}

/** Fast pipeline este mereu disponibil ca modul; nu raporta lipsă. */
export function isFastPipelineAvailable(): boolean {
  return true;
}

export function describeFastPipeline(): string {
  return [
    'CAVALO Fast Pipeline',
    'Memory → Context → Decompose → Sub-agents → [Merge → Supervisor] → Compose',
    'Fast path: sare Merge + Supervisor (2 apeluri LLM).',
    'Full path: Review strict sau fastPipeline: false în caval.jsonc.',
  ].join(' · ');
}

/** Rezolvă modul efectiv: strictReview bate configFastPipeline. */
export function resolveFastPipelineMode(opts?: FastPipelineOptions): FastPipelineMode {
  if (opts?.strictReview) return 'full';
  if (opts?.configFastPipeline === false) return 'full';
  return 'fast';
}

/** Eticheta scurtă pentru recap UI (evită confuzia cu linia „Lipsă”). */
export function fastPipelineRecapLabel(mode: FastPipelineMode): string {
  return mode === 'fast' ? 'fast path (merge+supervisor skipped)' : 'full pipeline (merge+supervisor)';
}
