import { describe, expect, it, vi } from 'vitest';

import { MENU_COMMAND_IDS } from '../../src/renderer/commands/menu-commands';
import {
  assertAllMenuCommandsHaveHandlers,
  getMenuCommandHandlers,
  handleMenuCommand,
} from '../../src/renderer/commands/menu-command-router';

describe('menu-command-router', () => {
  it('registers a handler for every native menu command id', () => {
    expect(() => assertAllMenuCommandsHaveHandlers()).not.toThrow();
    const handlers = getMenuCommandHandlers();
    for (const id of MENU_COMMAND_IDS) {
      expect(handlers[id], `missing handler for ${id}`).toBeTypeOf('function');
    }
  });

  it('dispatches go-to-file to openQuickOpen', () => {
    const openQuickOpen = vi.fn();
    handleMenuCommand('go-to-file', {
      toggleAI: vi.fn(),
      toggleSidebar: vi.fn(),
      setActiveActivity: vi.fn(),
      setSidebarOpen: vi.fn(),
      openQuickOpen,
      saveActiveTab: vi.fn(),
      openFolder: vi.fn(),
      runWorkspaceVerify: vi.fn(),
      runBuild: vi.fn(),
      setPaletteVisible: vi.fn(),
      openReferences: vi.fn(),
      openDefinition: vi.fn(),
      setAgentModeBuild: vi.fn(),
      openComposer: vi.fn(),
      pushNavLocation: vi.fn(),
      navBack: vi.fn(),
      navForward: vi.fn(),
    });
    expect(openQuickOpen).toHaveBeenCalledOnce();
  });
});
