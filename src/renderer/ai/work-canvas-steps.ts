import type { LiveAiEdit } from '../../../ai/composer/live-ai-edits-store';

export type WorkCanvasStepId = 'preparing' | 'creating' | 'writing' | 'preview';

export type WorkCanvasStepStatus = 'pending' | 'active' | 'done';

export interface WorkCanvasStep {
  id: WorkCanvasStepId;
  status: WorkCanvasStepStatus;
  detailPath?: string;
}

export function getCurrentWritingPath(
  order: string[],
  edits: Record<string, LiveAiEdit>
): string | null {
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const path = order[i];
    if (!path) continue;
    const edit = edits[path];
    if (edit?.status === 'writing') return path;
  }
  return null;
}

export function hasUsableEditorSurface(input: {
  activeTabIsAiPreview: boolean;
  activeTabPath: string | null;
  projectPath: string | null;
  order: string[];
  edits: Record<string, LiveAiEdit>;
}): boolean {
  if (input.activeTabIsAiPreview) return true;
  if (!input.activeTabPath) return false;
  return input.order.some((path) => {
    const edit = input.edits[path];
    if (!edit || (edit.status !== 'writing' && edit.status !== 'waiting')) return false;
    const tabNorm = input.activeTabPath!.replace(/\\/g, '/');
    const editNorm = path.replace(/\\/g, '/');
    if (tabNorm.endsWith(editNorm) || tabNorm.includes(editNorm)) return true;
    if (input.projectPath) {
      const root = input.projectPath.replace(/\\/g, '/');
      return tabNorm === `${root}/${editNorm}`;
    }
    return false;
  });
}

export function deriveWorkCanvasSteps(input: {
  hasProject: boolean;
  isStreaming: boolean;
  order: string[];
  edits: Record<string, LiveAiEdit>;
  previewStarting: boolean;
}): WorkCanvasStep[] {
  const writingPath = getCurrentWritingPath(input.order, input.edits);
  const hasWaiting = input.order.some((p) => input.edits[p]?.status === 'waiting');
  const hasAnyEdit = input.order.length > 0;

  const preparing: WorkCanvasStep = {
    id: 'preparing',
    status: !input.hasProject
      ? input.isStreaming
        ? 'active'
        : 'pending'
      : 'done',
  };

  let creatingStatus: WorkCanvasStepStatus = 'pending';
  if (input.hasProject && input.isStreaming) {
    if (writingPath) {
      creatingStatus = 'done';
    } else if (hasWaiting || hasAnyEdit) {
      creatingStatus = 'active';
    } else {
      creatingStatus = 'active';
    }
  }

  const creating: WorkCanvasStep = {
    id: 'creating',
    status: creatingStatus,
  };

  const writing: WorkCanvasStep = {
    id: 'writing',
    status: writingPath ? 'active' : hasAnyEdit && input.isStreaming ? 'pending' : 'pending',
    detailPath: writingPath ?? undefined,
  };

  const steps: WorkCanvasStep[] = [preparing, creating, writing];

  if (input.previewStarting) {
    steps.push({
      id: 'preview',
      status: 'active',
    });
  }

  return steps.slice(0, 4);
}
