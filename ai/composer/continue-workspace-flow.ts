/**
 * @vitest-environment jsdom
 */
import type { WorkspaceDiscoverySnapshot } from '../../src/shared/workspace-discovery-contract';
import {
  buildWorkspaceDiscoveryUserMessage,
  isContinueWorkspaceRequest,
  isInspectOnlyWorkspaceRequest,
} from '../workspace/workspace-discovery';
import { buildContinueWorkspaceContextMessage } from '../prompts/continue-workspace';

export interface ContinueWorkspaceFlowResult {
  handled: boolean;
  earlyReturn: boolean;
  augmentedUserText?: string;
  snapshot?: WorkspaceDiscoverySnapshot;
}

const NO_WORKSPACE_MESSAGE =
  'Nu este deschis niciun folder de proiect. Alege un folder sau creează un proiect.';

type CavalWorkspaceApi = {
  workspaceDiscover?: (options?: { runVerify?: boolean }) => Promise<WorkspaceDiscoverySnapshot>;
};

export async function runContinueWorkspaceFlow(input: {
  userText: string;
  boundWorkspace?: string | null;
  caval?: CavalWorkspaceApi;
}): Promise<ContinueWorkspaceFlowResult> {
  if (!isContinueWorkspaceRequest(input.userText)) {
    return { handled: false, earlyReturn: false };
  }

  const workspace = input.boundWorkspace?.trim();
  if (!workspace) {
    return {
      handled: true,
      earlyReturn: true,
      snapshot: {
        ok: false,
        error: NO_WORKSPACE_MESSAGE,
        projectName: '',
        projectType: 'unknown',
        hasPackageJson: false,
        hasReadme: false,
        rootEntries: [],
        keyDirs: [],
        scripts: {},
        todos: [],
        recommendedNextStep: 'Deschide sau creează un proiect, apoi reîncearcă.',
      },
    };
  }

  const discover = input.caval?.workspaceDiscover;
  if (!discover) {
    return {
      handled: true,
      earlyReturn: true,
      snapshot: {
        ok: false,
        error: 'Workspace discovery nu este disponibil în această sesiune.',
        projectName: '',
        projectType: 'unknown',
        hasPackageJson: false,
        hasReadme: false,
        rootEntries: [],
        keyDirs: [],
        scripts: {},
        todos: [],
        recommendedNextStep: 'Repornește aplicația și reîncearcă.',
      },
    };
  }

  const snapshot = await discover({ runVerify: true });
  const assistantText = buildWorkspaceDiscoveryUserMessage(snapshot);

  if (!snapshot.ok) {
    return { handled: true, earlyReturn: true, snapshot };
  }

  if (isInspectOnlyWorkspaceRequest(input.userText)) {
    return { handled: true, earlyReturn: true, snapshot };
  }

  const augmentedUserText = [
    buildContinueWorkspaceContextMessage(snapshot),
    '',
    '---',
    '',
    `Cerere utilizator: ${input.userText.trim()}`,
    '',
    assistantText,
  ].join('\n');

  return {
    handled: true,
    earlyReturn: false,
    augmentedUserText,
    snapshot,
  };
}

export { buildWorkspaceDiscoveryUserMessage, NO_WORKSPACE_MESSAGE };
