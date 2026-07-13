import { describe, expect, it, vi } from 'vitest';

import { WelcomeWorkspacePanel } from '../../src/renderer/components/workbench/WelcomeWorkspacePanel';
import {
  handleWelcomeCloneKeyDown,
  toggleWelcomeRecentList,
  WELCOME_NO_RECENT_PROJECTS,
  WELCOME_RECENT_PROJECTS_LABEL,
} from '../../src/renderer/components/workbench/welcome-workspace-utils';

describe('WelcomeWorkspacePanel', () => {
  it('exports the welcome workspace component', () => {
    expect(typeof WelcomeWorkspacePanel).toBe('function');
  });
});

describe('welcome-workspace-utils', () => {
  it('uses proiecte recente label', () => {
    expect(WELCOME_RECENT_PROJECTS_LABEL).toBe('proiecte recente');
  });

  it('handles Enter and Escape for clone input', () => {
    const onEnter = vi.fn();
    const onEscape = vi.fn();
    handleWelcomeCloneKeyDown('Enter', { onEnter, onEscape });
    handleWelcomeCloneKeyDown('Escape', { onEnter, onEscape });
    expect(onEnter).toHaveBeenCalledOnce();
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it('toggles recent projects list visibility', () => {
    expect(toggleWelcomeRecentList(false)).toBe(true);
    expect(toggleWelcomeRecentList(true)).toBe(false);
  });

  it('uses empty recent projects message', () => {
    expect(WELCOME_NO_RECENT_PROJECTS).toBe('Niciun proiect recent');
  });
});
