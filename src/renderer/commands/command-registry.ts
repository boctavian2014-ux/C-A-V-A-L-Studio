import {
  dispatchTerminalNew,
  dispatchTerminalPanelTab,
  dispatchTerminalToggle,
} from '../terminal/terminal-events';

export type WorkbenchActivity = 'explorer' | 'search' | 'git' | 'extensions' | 'settings';

export interface WorkbenchCommandContext {
  toggleAI: () => void;
  toggleSidebar: () => void;
  setActiveActivity: (tab: WorkbenchActivity) => void;
  setSidebarOpen: (open: boolean) => void;
  openQuickOpen: () => void;
  saveActiveTab: () => void;
  openFolder: () => Promise<void>;
  runWorkspaceVerify: () => Promise<void>;
  runBuild: () => Promise<void>;
  openShortcuts?: () => void;
}

export interface WorkbenchCommand {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  keywords?: string[];
  run: () => void | Promise<void>;
}

export function buildWorkbenchCommands(ctx: WorkbenchCommandContext): WorkbenchCommand[] {
  const view = (tab: WorkbenchActivity, label: string): WorkbenchCommand => ({
    id: `view:${tab}`,
    label,
    category: 'View',
    run: () => {
      ctx.setActiveActivity(tab);
      ctx.setSidebarOpen(true);
    },
  });

  return [
    {
      id: 'ai:toggle',
      label: 'AI: Open Chat',
      category: 'AI',
      shortcut: 'Ctrl+Shift+A',
      keywords: ['chat', 'assistant', 'panel'],
      run: () => ctx.toggleAI(),
    },
    {
      id: 'file:save',
      label: 'File: Save',
      category: 'File',
      shortcut: 'Ctrl+S',
      keywords: ['save', 'write'],
      run: () => ctx.saveActiveTab(),
    },
    {
      id: 'file:open-folder',
      label: 'File: Open Folder',
      category: 'File',
      keywords: ['folder', 'project', 'workspace'],
      run: () => void ctx.openFolder(),
    },
    {
      id: 'nav:quick-open',
      label: 'Go to File',
      category: 'Navigation',
      shortcut: 'Ctrl+P',
      keywords: ['file', 'quick', 'open', 'goto'],
      run: () => ctx.openQuickOpen(),
    },
    {
      id: 'view:shortcuts',
      label: 'View: Keyboard Shortcuts',
      category: 'View',
      shortcut: 'Ctrl+Shift+/',
      keywords: ['help', 'shortcuts', 'keys'],
      run: () => ctx.openShortcuts?.(),
    },
    view('search', 'View: Search'),
    view('explorer', 'View: Explorer'),
    view('git', 'View: Source Control'),
    view('extensions', 'View: Extensions'),
    view('settings', 'View: Settings'),
    {
      id: 'terminal:new',
      label: 'Terminal: New',
      category: 'Terminal',
      shortcut: 'Ctrl+Shift+`',
      keywords: ['terminal', 'shell', 'powershell'],
      run: () => dispatchTerminalNew(),
    },
    {
      id: 'terminal:toggle',
      label: 'Terminal: Toggle Panel',
      category: 'Terminal',
      keywords: ['terminal', 'panel', 'bottom'],
      run: () => dispatchTerminalToggle(),
    },
    {
      id: 'view:output',
      label: 'View: Output',
      category: 'View',
      shortcut: 'Ctrl+Shift+U',
      keywords: ['output', 'log', 'build'],
      run: () => dispatchTerminalPanelTab('output'),
    },
    {
      id: 'view:problems',
      label: 'View: Problems',
      category: 'View',
      keywords: ['problems', 'errors', 'diagnostics'],
      run: () => dispatchTerminalPanelTab('problems'),
    },
    {
      id: 'view:toggle-sidebar',
      label: 'View: Toggle Sidebar',
      category: 'View',
      shortcut: 'Ctrl+B',
      run: () => ctx.toggleSidebar(),
    },
    {
      id: 'run:tests',
      label: 'Run: npm test (verify workspace)',
      category: 'Run',
      keywords: ['test', 'verify', 'vitest', 'jest'],
      run: () => void ctx.runWorkspaceVerify(),
    },
    {
      id: 'run:build',
      label: 'Run: npm run build',
      category: 'Run',
      keywords: ['build', 'compile', 'webpack'],
      run: () => void ctx.runBuild(),
    },
  ];
}

export function fuzzyCommandScore(query: string, cmd: WorkbenchCommand): number {
  const q = query.toLowerCase().trim();
  if (!q) return 1;
  const hay = `${cmd.label} ${cmd.category} ${cmd.keywords?.join(' ') ?? ''}`.toLowerCase();
  if (hay.includes(q)) return 80 - hay.indexOf(q);
  let qi = 0;
  let score = 0;
  for (let i = 0; i < hay.length && qi < q.length; i++) {
    if (hay[i] === q[qi]) {
      score += 4;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}
