import { ModelRotator, planExecution } from './orchestrator';
import type { ExecutionPlan, PipelineTask } from './types';

export { ModelRotator, planExecution };

export function formatOrchestratorSummary(plan: ExecutionPlan, tasks: PipelineTask[]): string {
  const lines = [
    '**Pipeline Execution Plan**',
    'Full multi-agent pipeline: Context → Decompose → Sub-Agents → Merge → Supervisor → Compose',
    '',
    '**Agent Activation Order**',
    plan.agentOrder.join(' → '),
    '',
    '**Task Distribution Map**',
    ...tasks.map((t) => `- ${t.id} (${t.module}): ${plan.taskDistributionMap[t.id] ?? 'auto'}`),
  ];
  return lines.join('\n');
}
