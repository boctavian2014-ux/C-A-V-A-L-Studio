/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';

import {
  buildWorkspaceDiscoveryUserMessage,
  detectLockfile,
  isContinueWorkspaceRequest,
  isInspectOnlyWorkspaceRequest,
  parsePackageScripts,
  recommendNextStep,
} from '../../ai/workspace/workspace-discovery';
import {
  runContinueWorkspaceFlow,
  NO_WORKSPACE_MESSAGE,
} from '../../ai/composer/continue-workspace-flow';
import { isUrlLikeWorkspacePath } from '../../src/shared/workspace-discovery-contract';
import type { WorkspaceDiscoverySnapshot } from '../../src/shared/workspace-discovery-contract';

function baseSnapshot(
  overrides: Partial<WorkspaceDiscoverySnapshot> = {}
): WorkspaceDiscoverySnapshot {
  return {
    ok: true,
    projectName: 'my-app',
    projectType: 'TypeScript/Vite',
    hasPackageJson: true,
    hasReadme: true,
    rootEntries: ['package.json', 'src/', 'README.md'],
    keyDirs: ['src'],
    scripts: { typecheck: 'tsc --noEmit', test: 'vitest run' },
    todos: [],
    recommendedNextStep: 'Rulez validarea proiectului.',
    ...overrides,
  };
}

describe('continue-workspace intent', () => {
  it('detects Romanian and English continue/inspect phrases', () => {
    expect(isContinueWorkspaceRequest('verifică folderul')).toBe(true);
    expect(isContinueWorkspaceRequest('check project folder')).toBe(true);
    expect(isContinueWorkspaceRequest('vezi unde ai rămas')).toBe(true);
    expect(isContinueWorkspaceRequest('see where you left off')).toBe(true);
    expect(isContinueWorkspaceRequest('continuă proiectul')).toBe(true);
    expect(isContinueWorkspaceRequest('continue the project')).toBe(true);
    expect(isContinueWorkspaceRequest('continuă')).toBe(true);
    expect(isContinueWorkspaceRequest('continue')).toBe(true);
    expect(isContinueWorkspaceRequest('resume the workspace')).toBe(true);
  });

  it('treats Romanian diacritic continue phrases as continue, not inspect-only (#56)', () => {
    expect(isContinueWorkspaceRequest('Continuă de unde am rămas')).toBe(true);
    expect(isInspectOnlyWorkspaceRequest('Continuă de unde am rămas')).toBe(false);

    expect(isContinueWorkspaceRequest('CONTINUĂ')).toBe(true);
    expect(isInspectOnlyWorkspaceRequest('CONTINUĂ')).toBe(false);

    expect(isContinueWorkspaceRequest('Continua')).toBe(true);
    expect(isInspectOnlyWorkspaceRequest('Continua')).toBe(false);

    expect(isContinueWorkspaceRequest('Verifică proiectul și continuă de unde am rămas')).toBe(
      true
    );
    expect(
      isInspectOnlyWorkspaceRequest('Verifică proiectul și continuă de unde am rămas')
    ).toBe(false);

    expect(isInspectOnlyWorkspaceRequest('Verifică folderul')).toBe(true);
    expect(isContinueWorkspaceRequest('Verifică folderul')).toBe(true);
  });

  it('does not false-positive on continuăm / continuare (#56)', () => {
    expect(isContinueWorkspaceRequest('Continuăm discuția')).toBe(false);
    expect(isInspectOnlyWorkspaceRequest('Continuăm discuția')).toBe(false);
    expect(isContinueWorkspaceRequest('Aceasta este o continuare a planului')).toBe(false);
  });

  it('does not treat system continue markers as workspace continue', () => {
    expect(isContinueWorkspaceRequest('SCAFFOLD_CONTINUE')).toBe(false);
    expect(isContinueWorkspaceRequest('DELIVERY_CONTINUE')).toBe(false);
    expect(isContinueWorkspaceRequest('ARENA_CONTINUE')).toBe(false);
    expect(isContinueWorkspaceRequest('AGENTIC_REPAIR')).toBe(false);
  });

  it('distinguishes inspect-only from continue', () => {
    expect(isInspectOnlyWorkspaceRequest('verifică folderul')).toBe(true);
    expect(isInspectOnlyWorkspaceRequest('check project folder')).toBe(false);
    expect(isInspectOnlyWorkspaceRequest('continuă proiectul')).toBe(false);
  });

  it('rejects URL-like workspace paths', () => {
    expect(isUrlLikeWorkspacePath('https://evil.example/repo')).toBe(true);
    expect(isUrlLikeWorkspacePath('file:///tmp/x')).toBe(true);
    expect(isUrlLikeWorkspacePath('/home/user/project')).toBe(false);
  });
});

describe('continue-workspace parsing', () => {
  it('extracts scripts from package.json shape', () => {
    expect(
      parsePackageScripts({
        scripts: {
          typecheck: 'tsc --noEmit',
          lint: 'eslint .',
          test: 'vitest run',
          build: 'webpack',
          start: 'electron .',
        },
      })
    ).toEqual({
      typecheck: 'tsc --noEmit',
      lint: 'eslint .',
      test: 'vitest run',
      build: 'webpack',
      dev: 'electron .',
    });
  });

  it('detects lockfile kind from root entries', () => {
    expect(detectLockfile(['package-lock.json', 'package.json'])).toBe('npm');
    expect(detectLockfile(['pnpm-lock.yaml'])).toBe('pnpm');
    expect(detectLockfile(['yarn.lock'])).toBe('yarn');
    expect(detectLockfile(['package.json'])).toBeUndefined();
  });

  it('builds user message with git and scripts, not README-only', () => {
    const msg = buildWorkspaceDiscoveryUserMessage(
      baseSnapshot({
        git: {
          isRepo: true,
          branch: 'main',
          modifiedCount: 2,
          modifiedFiles: ['src/Settings.tsx', 'package.json'],
          lastCommit: 'abc123 fix settings',
        },
      })
    );
    expect(msg).toContain('my-app');
    expect(msg).toContain('TypeScript/Vite');
    expect(msg).toContain('Scripts detectate');
    expect(msg).toContain('2 fișier(e) modificate');
    expect(msg).toContain('Următorul pas');
    expect(msg).not.toContain('Please provide the next file');
  });

  it('handles workspace without package.json as generic project', () => {
    const msg = buildWorkspaceDiscoveryUserMessage(
      baseSnapshot({
        hasPackageJson: false,
        projectType: 'generic folder',
        scripts: {},
      })
    );
    expect(msg).toContain('Nu există package.json');
    expect(msg).toContain('generic folder');
  });

  it('recommends fixing verify failures before edits', () => {
    const step = recommendNextStep(
      baseSnapshot({
        verify: { ran: true, summary: 'typecheck failed', allOk: false },
      })
    );
    expect(step).toMatch(/validare/i);
  });
});

describe('runContinueWorkspaceFlow', () => {
  it('returns early with clear message when no workspace is bound', async () => {
    const result = await runContinueWorkspaceFlow({
      userText: 'continuă',
      boundWorkspace: '',
      caval: { workspaceDiscover: vi.fn() },
    });
    expect(result.handled).toBe(true);
    expect(result.earlyReturn).toBe(true);
    expect(result.snapshot?.error).toBe(NO_WORKSPACE_MESSAGE);
  });

  it('inspect-only returns early after discovery without augmenting prompt', async () => {
    const snapshot = baseSnapshot();
    const discover = vi.fn().mockResolvedValue(snapshot);
    const result = await runContinueWorkspaceFlow({
      userText: 'verifică folderul',
      boundWorkspace: '/tmp/my-app',
      caval: { workspaceDiscover: discover },
    });
    expect(discover).toHaveBeenCalledWith({ runVerify: true });
    expect(result.earlyReturn).toBe(true);
    expect(result.augmentedUserText).toBeUndefined();
  });

  it('continue intent augments user text with discovery context', async () => {
    const snapshot = baseSnapshot({
      git: {
        isRepo: true,
        branch: 'feat/x',
        modifiedCount: 1,
        modifiedFiles: ['src/App.tsx'],
      },
    });
    const result = await runContinueWorkspaceFlow({
      userText: 'continuă',
      boundWorkspace: '/tmp/my-app',
      caval: { workspaceDiscover: vi.fn().mockResolvedValue(snapshot) },
    });
    expect(result.handled).toBe(true);
    expect(result.earlyReturn).toBe(false);
    expect(result.augmentedUserText).toContain('CONTINUE_WORKSPACE');
    expect(result.augmentedUserText).toContain('Cerere utilizator: continuă');
    expect(result.augmentedUserText).toContain('my-app');
  });

  it('ignores non-continue messages', async () => {
    const result = await runContinueWorkspaceFlow({
      userText: 'add a login page',
      boundWorkspace: '/tmp/my-app',
      caval: { workspaceDiscover: vi.fn() },
    });
    expect(result.handled).toBe(false);
  });
});
