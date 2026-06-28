import type { PipelineTask } from './types';

const TASK_LINE = /^\s*[-*•]\s*Task\s+(\w+[\w-]*)\s*:\s*(.+)$/i;
const MODULE_LINE = /^\s*[-*•]\s*Module\s+(\w+[\w-]*)\s*:\s*(.+)$/i;
const BULLET_TASK = /^\s*[-*•]\s*(?:Task\s+)?(\w[\w-]*)\s*:\s*(.+)$/i;

function slugId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

function normalizeModuleName(line: string): { module: string; purpose: string } {
  const mod = line.match(MODULE_LINE);
  if (mod) {
    return { module: mod[1]!, purpose: mod[2]!.trim() };
  }
  const generic = line.match(/^\s*[-*•]\s*(.+?)\s*:\s*(.+)$/);
  if (generic) {
    return { module: generic[1]!.trim(), purpose: generic[2]!.trim() };
  }
  return { module: `module-${Date.now()}`, purpose: line.trim() };
}

const PHASE_UI_TAG = /\[phase:ui\]/i;

function parseTaskDescription(raw: string): { description: string; phase?: 'ui' | 'core' } {
  let description = raw.trim();
  let phase: 'ui' | 'core' | undefined;
  if (PHASE_UI_TAG.test(description)) {
    phase = 'ui';
    description = description.replace(PHASE_UI_TAG, '').trim();
  } else if (/\b(frontend|ui\/ux|user interface|dashboard ui|ui shell)\b/i.test(description)) {
    phase = 'ui';
  }
  return { description, phase };
}

export function parseDecompositionOutput(raw: string, maxTasks = 8): PipelineTask[] {
  const tasks: PipelineTask[] = [];
  let currentModule = 'core';
  let currentPurpose = 'Core module';
  const lines = raw.split('\n');

  for (const line of lines) {
    const modMatch = line.match(MODULE_LINE);
    if (modMatch) {
      currentModule = modMatch[1]!;
      currentPurpose = modMatch[2]!.trim();
      continue;
    }

    const altMod = line.match(/^\s*[-*•]\s*Module\s+(.+?)\s*:\s*(.+)$/i);
    if (altMod && !TASK_LINE.test(line)) {
      currentModule = altMod[1]!.trim().replace(/\s+/g, '-').toLowerCase();
      currentPurpose = altMod[2]!.trim();
      continue;
    }

    const taskMatch = line.match(TASK_LINE) ?? line.match(BULLET_TASK);
    if (taskMatch) {
      const taskId = taskMatch[1]!.toLowerCase().replace(/\s+/g, '-');
      const { description, phase } = parseTaskDescription(taskMatch[2]!);
      tasks.push({
        id: taskId,
        module: currentModule,
        purpose: currentPurpose,
        description,
        dependencies: [],
        phase,
      });
    }
  }

  if (tasks.length === 0) {
    const goalMatch = raw.match(/\*\*Project Goal:\*\*\s*([^\n]+)/i);
    const goal = goalMatch?.[1]?.trim() ?? 'Implement user request';
    tasks.push({
      id: 'task-1',
      module: 'core',
      purpose: 'Main implementation',
      description: goal,
      dependencies: [],
    });
  }

  if (tasks.length > maxTasks) {
    const kept = tasks.slice(0, maxTasks - 1);
    const overflow = tasks.slice(maxTasks - 1);
    kept.push({
      id: 'integration',
      module: 'integration',
      purpose: 'Integrate remaining modules',
      description: overflow.map((t) => `${t.module}: ${t.description}`).join('; '),
      dependencies: kept.map((t) => t.id),
    });
    return kept;
  }

  return tasks;
}

export function parseDependencies(raw: string, tasks: PipelineTask[]): PipelineTask[] {
  const depSection = raw.match(/\*\*Dependencies:\*\*\s*([\s\S]*?)(?=\*\*|$)/i)?.[1] ?? '';
  if (!depSection.trim()) return tasks;

  return tasks.map((task) => {
    const deps: string[] = [];
    for (const other of tasks) {
      if (other.id === task.id) continue;
      const pattern = new RegExp(`${task.module}[^\\n]*${other.module}|${other.module}[^\\n]*${task.module}`, 'i');
      if (pattern.test(depSection)) {
        deps.push(other.id);
      }
    }
    return { ...task, dependencies: deps };
  });
}

export function parseDecomposition(raw: string, maxTasks = 8): PipelineTask[] {
  const tasks = parseDecompositionOutput(raw, maxTasks);
  return parseDependencies(raw, tasks);
}
