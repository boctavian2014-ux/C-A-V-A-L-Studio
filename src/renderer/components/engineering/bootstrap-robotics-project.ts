import {
  roboticsPlanToMarkdown,
  type ParsedRoboticsPlan,
} from '../../../../ai/engineering/robotics-format';
import type { EngProject } from '../../../../ai/engineering/engineering-generator';
import { ensureDesktopProject, writeWorkspaceFile } from '../../hooks/useOpenWorkspace';

export const CAVAL_OPEN_EXPLORER_SIDEBAR_EVENT = 'caval:open-explorer-sidebar';

export function dispatchOpenExplorerSidebar(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CAVAL_OPEN_EXPLORER_SIDEBAR_EVENT));
  }
}

/** After first Robotics success: Desktop folder + ROBOTICS-PLAN.md + open explorer. */
export async function bootstrapRoboticsDesktopProject(input: {
  project: EngProject;
  plan?: ParsedRoboticsPlan | null;
  userPrompt?: string;
}): Promise<{ ok: boolean; path?: string; error?: string }> {
  const name =
    input.project.spec.title.trim() ||
    input.userPrompt?.trim().slice(0, 48) ||
    'Cavallo-Robotics';

  const ensured = await ensureDesktopProject(name);
  if (!ensured.ok || !ensured.path) {
    return { ok: false, error: ensured.error ?? 'Nu am putut crea proiectul pe Desktop.' };
  }

  dispatchOpenExplorerSidebar();

  const markdown = input.plan
    ? roboticsPlanToMarkdown(input.plan, input.project.spec.title)
    : [
        `# ${input.project.spec.title}`,
        '',
        input.project.spec.summary,
        '',
        input.userPrompt ? `## Cerere\n${input.userPrompt}` : '',
      ]
        .filter(Boolean)
        .join('\n');

  await writeWorkspaceFile('ROBOTICS-PLAN.md', markdown);
  return { ok: true, path: ensured.path };
}
