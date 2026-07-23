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
  it('toggles the recent list boolean', () => {
    expect(toggleWelcomeRecentList(false)).toBe(true);
    expect(toggleWelcomeRecentList(true)).toBe(false);
  });

  it('fires onEnter only for Enter key', () => {
    const onEnter = vi.fn();
    const onEscape = vi.fn();
    handleWelcomeCloneKeyDown('Enter', { onEnter, onEscape });
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('fires onEscape only for Escape key', () => {
    const onEnter = vi.fn();
    const onEscape = vi.fn();
    handleWelcomeCloneKeyDown('Escape', { onEnter, onEscape });
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('ignores unrelated keys and tolerates missing handlers', () => {
    const onEnter = vi.fn();
    handleWelcomeCloneKeyDown('a', { onEnter });
    expect(onEnter).not.toHaveBeenCalled();
    expect(() => handleWelcomeCloneKeyDown('Enter', {})).not.toThrow();
  });

  it('exposes the Romanian recent-projects labels', () => {
    expect(WELCOME_RECENT_PROJECTS_LABEL).toBe('proiecte recente');
    expect(WELCOME_NO_RECENT_PROJECTS).toBe('Niciun proiect recent');
  });
});
