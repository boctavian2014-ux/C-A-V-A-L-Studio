import type { ArenaAgentRole, ArenaIssue, PipelineTask } from './types';

export interface RolePartition {
  implementer: PipelineTask[];
  tester: PipelineTask[];
  refactorer: PipelineTask[];
  implementerFix: PipelineTask[];
  implementerPerf: PipelineTask[];
}

export function partitionTasksByRole(tasks: PipelineTask[]): RolePartition {
  const out: RolePartition = {
    implementer: [],
    tester: [],
    refactorer: [],
    implementerFix: [],
    implementerPerf: [],
  };

  for (const task of tasks) {
    switch (task.role) {
      case 'tester':
        out.tester.push(task);
        break;
      case 'refactorer':
        out.refactorer.push(task);
        break;
      case 'implementer-fix':
        out.implementerFix.push(task);
        break;
      case 'implementer-perf':
        out.implementerPerf.push(task);
        break;
      case 'implementer':
      default:
        out.implementer.push(task);
        break;
    }
  }

  return out;
}

export function buildFixTasksFromIssues(issues: ArenaIssue[], prefix: string): PipelineTask[] {
  return issues.slice(0, 8).map((issue, i) => ({
    id: `${prefix}-${i + 1}`,
    module: 'fix',
    purpose: 'Resolve arena issue',
    description: `[role:implementer-fix] ${issue.severity}: ${issue.message}${issue.file ? ` (${issue.file})` : ''}`,
    dependencies: [],
    role: 'implementer-fix' as ArenaAgentRole,
  }));
}

export function buildPerfTasksFromPlan(plan: string, issues: ArenaIssue[]): PipelineTask[] {
  const tasks: PipelineTask[] = [];
  if (plan.trim()) {
    tasks.push({
      id: 'perf-0',
      module: 'performance',
      purpose: 'Apply optimization plan',
      description: `[role:implementer-perf] ${plan.slice(0, 500)}`,
      dependencies: [],
      role: 'implementer-perf',
    });
  }
  for (const [i, issue] of issues.slice(0, 4).entries()) {
    tasks.push({
      id: `perf-${i + 1}`,
      module: 'performance',
      purpose: 'Fix performance issue',
      description: `[role:implementer-perf] ${issue.message}`,
      dependencies: [],
      role: 'implementer-perf',
    });
  }
  return tasks;
}
