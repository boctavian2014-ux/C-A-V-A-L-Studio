import type { ZLPartialPlan } from './zl-types';

/** Short preview for chat input / prepare state. */
export function formatPartialPlanPreview(partial: ZLPartialPlan): string {
  const lines = [
    'Plan preliminar (Zero-Latency):',
    ...partial.plan.steps.slice(0, 5).map((s, i) => `${i + 1}. ${s.title}`),
  ];
  if (partial.plan.steps.length > 5) lines.push('…');
  return lines.join('\n');
}
