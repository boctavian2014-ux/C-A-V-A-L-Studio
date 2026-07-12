import type { PipelineTask, ArenaAgentRole } from './types';
import { filterForbiddenTasks } from '../../scaffolds/workspace-forbidden-paths';

const TASK_LINE =
  /^\s*[-*•]\s*\*{0,2}Task\s+([\w.-]+)\*{0,2}\s*:\s*(.+)$/i;
const MODULE_LINE =
  /^\s*[-*•]\s*\*{0,2}Module\s+([\w\s.&-]+?)\*{0,2}\s*:\s*(.+)$/i;
const BULLET_TASK =
  /^\s*[-*•]\s*\*{0,2}(?:Task\s+)?([\w.-]+)\*{0,2}\s*:\s*(.+)$/i;
const BOLD_SECTION =
  /^\s*[-*•]\s*\*\*(.+?)\*\*\s*:\s*(.+)$/;

const PHASE_UI_TAG = /\[phase:ui\]/i;
const ROLE_TAG = /\[role:(implementer|tester|refactorer|implementer-fix|implementer-perf)\]/i;

const MODULE_HINT_PATTERNS = [
  /\bModule\s+\d+/gi,
  /\*\*Module\s+/gi,
  /^\s*[-*•]\s*Module\s+/gim,
  /\bTask\s+[\d.]+/gi,
  /\bLayer\b/gi,
  /\bIngestion\b/gi,
  /\bBackend\b/gi,
  /\bFrontend\b/gi,
  /\bDeployment\b/gi,
];

function slugId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

function parseTaskDescription(raw: string): {
  description: string;
  phase?: 'ui' | 'core';
  role?: ArenaAgentRole;
} {
  let description = raw.trim();
  let phase: 'ui' | 'core' | undefined;
  let role: ArenaAgentRole | undefined;

  const roleMatch = ROLE_TAG.exec(description);
  if (roleMatch) {
    role = roleMatch[1] as ArenaAgentRole;
    description = description.replace(ROLE_TAG, '').trim();
  }

  if (PHASE_UI_TAG.test(description)) {
    phase = 'ui';
    description = description.replace(PHASE_UI_TAG, '').trim();
  } else if (/\b(frontend|ui\/ux|user interface|dashboard ui|ui shell)\b/i.test(description)) {
    phase = 'ui';
  }

  if (!role) {
    role = 'implementer';
  }

  return { description, phase, role };
}

function slugModule(name: string): string {
  return name
    .trim()
    .replace(/\*\*/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/gi, '')
    .toLowerCase()
    .slice(0, 48) || 'module';
}

function slugTaskId(rawId: string, index: number): string {
  const cleaned = rawId.trim().replace(/\*\*/g, '').toLowerCase();
  if (/^[\w.-]+$/.test(cleaned)) return cleaned.replace(/\./g, '-');
  return slugId('task', index);
}

/** Count architecture/module hints in raw decomposition text (for anti-collapse validation). */
export function countModuleHints(raw: string): number {
  let hints = 0;
  for (const pattern of MODULE_HINT_PATTERNS) {
    const matches = raw.match(pattern);
    if (matches) hints += matches.length;
  }
  return hints;
}

/** True when parser fell back to single task-1 but raw text suggests multiple modules. */
export function isDecompositionCollapsed(raw: string, tasks: PipelineTask[]): boolean {
  if (tasks.length !== 1) return false;
  if (tasks[0]?.id !== 'task-1' || tasks[0]?.module !== 'core') return false;
  return countModuleHints(raw) >= 3;
}

export function parseDecompositionOutput(raw: string, maxTasks = 8): PipelineTask[] {
  const tasks: PipelineTask[] = [];
  let currentModule = 'core';
  let currentPurpose = 'Core module';
  let taskIndex = 0;
  const lines = raw.split('\n');

  for (const line of lines) {
    const modMatch = line.match(MODULE_LINE);
    if (modMatch) {
      currentModule = slugModule(modMatch[1]!);
      currentPurpose = modMatch[2]!.trim();
      continue;
    }

    const boldSection = line.match(BOLD_SECTION);
    if (boldSection && !TASK_LINE.test(line)) {
      const label = boldSection[1]!.trim();
      if (/^(project goal|high-level architecture|dependencies|deployment|store)/i.test(label)) {
        continue;
      }
      if (/layer|module|ingestion|processing|api|frontend|deployment|storage/i.test(label)) {
        currentModule = slugModule(label);
        currentPurpose = boldSection[2]!.trim();
        continue;
      }
    }

    const taskMatch = line.match(TASK_LINE) ?? line.match(BULLET_TASK);
    if (taskMatch) {
      const rawId = taskMatch[1]!;
      if (/^(project|high|dependencies|deployment|store|understood)$/i.test(rawId)) continue;

      const taskId = slugTaskId(rawId, taskIndex);
      taskIndex += 1;
      const { description, phase, role } = parseTaskDescription(taskMatch[2]!);
      if (description.length < 4) continue;

      tasks.push({
        id: taskId,
        module: currentModule,
        purpose: currentPurpose,
        description,
        dependencies: [],
        phase,
        role,
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
      role: 'implementer',
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
  const withDeps = parseDependencies(raw, tasks);
  const { kept } = filterForbiddenTasks(withDeps);
  return kept;
}
