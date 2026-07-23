import type { WorkbenchCommandContext } from './command-registry';
import { showWorkbenchToast } from './workbench-toast';
import { MENU_COMMAND_IDS, type MenuCommandId } from './menu-commands';
import { MONACO_ACTIONS, triggerMonacoAction } from '../store/editor-command-store';
import { useEditorStore } from '../store/editor-store';
import { useSettingsStore } from '../store/settings-store';
import { useAIStore } from '../../../ai/composer/ai-store';
import {
  dispatchTerminalNew,
  dispatchTerminalPanelTab,
  dispatchTerminalSplit,
  dispatchTerminalToggle,
  dispatchRunInTerminal,
} from '../terminal/terminal-events';
import { revealProblem, useProblemsStore } from '../store/problems-store';

export interface MenuCommandContext extends WorkbenchCommandContext {
  setPaletteVisible: (open: boolean) => void;
  openReferences: () => Promise<void>;
  openDefinition: () => Promise<void>;
  setAgentModeBuild: () => void;
  openComposer: () => void;
  pushNavLocation: (path: string) => void;
  navBack: () => void;
  navForward: () => void;
}

type Handler = (ctx: MenuCommandContext) => void | Promise<void>;

const comingSoon = (label: string): Handler => () => {
  console.warn(`[menu] Not implemented: ${label}`);
  showWorkbenchToast(`În curând: ${label}`);
};

const handlers: Record<MenuCommandId, Handler> = {
  'new-file': () => {
    useEditorStore.getState().createUntitledTab();
  },
  save: (ctx) => ctx.saveActiveTab(),
  'save-as': async (ctx) => {
    const { activeTabId, tabs } = useEditorStore.getState();
    const tab = tabs.find((t) => t.id === activeTabId);
    const caval = window.caval;
    if (!tab || !caval?.saveFile) return;
    const res = await caval.saveFile({ path: tab.path, content: tab.content, saveAs: true });
    if (res.canceled || !res.path) return;
    useEditorStore.setState((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tab.id
          ? { ...t, id: res.path!, path: res.path!, name: res.label ?? t.name, isDirty: false }
          : t
      ),
      activeTabId: res.path!,
    }));
  },
  'open-settings': (ctx) => {
    ctx.setActiveActivity('settings');
    ctx.setSidebarOpen(true);
  },
  find: () => { triggerMonacoAction(MONACO_ACTIONS.find); },
  replace: () => { triggerMonacoAction(MONACO_ACTIONS.replace); },
  'find-in-files': (ctx) => {
    ctx.setActiveActivity('search');
    ctx.setSidebarOpen(true);
  },
  'replace-in-files': (ctx) => {
    ctx.setActiveActivity('search');
    ctx.setSidebarOpen(true);
  },
  'toggle-line-comment': () => { triggerMonacoAction(MONACO_ACTIONS.toggleLineComment); },
  'toggle-block-comment': () => { triggerMonacoAction(MONACO_ACTIONS.toggleBlockComment); },
  'emmet-expand': comingSoon('Emmet'),
  'selection-expand': () => { triggerMonacoAction(MONACO_ACTIONS.selectionExpand); },
  'selection-shrink': () => { triggerMonacoAction(MONACO_ACTIONS.selectionShrink); },
  'copy-line-up': () => { triggerMonacoAction(MONACO_ACTIONS.copyLineUp); },
  'copy-line-down': () => { triggerMonacoAction(MONACO_ACTIONS.copyLineDown); },
  'move-line-up': () => { triggerMonacoAction(MONACO_ACTIONS.moveLineUp); },
  'move-line-down': () => { triggerMonacoAction(MONACO_ACTIONS.moveLineDown); },
  'cursor-above': () => { triggerMonacoAction(MONACO_ACTIONS.cursorAbove); },
  'cursor-below': () => { triggerMonacoAction(MONACO_ACTIONS.cursorBelow); },
  palette: (ctx) => ctx.setPaletteVisible(true),
  'open-view': (ctx) => ctx.setPaletteVisible(true),
  'split-editor': comingSoon('Split Editor'),
  'single-editor': comingSoon('Single Editor'),
  'toggle-sidebar': (ctx) => ctx.toggleSidebar(),
  'view-explorer': (ctx) => {
    ctx.setActiveActivity('explorer');
    ctx.setSidebarOpen(true);
  },
  'view-search': (ctx) => {
    ctx.setActiveActivity('search');
    ctx.setSidebarOpen(true);
  },
  'view-source-control': (ctx) => {
    ctx.setActiveActivity('git');
    ctx.setSidebarOpen(true);
  },
  'view-run': () => {
    dispatchTerminalPanelTab('debug');
  },
  'view-extensions': (ctx) => {
    ctx.setActiveActivity('extensions');
    ctx.setSidebarOpen(true);
  },
  'view-problems': () => dispatchTerminalPanelTab('problems'),
  'view-output': () => dispatchTerminalPanelTab('output'),
  'view-debug-console': () => dispatchTerminalPanelTab('debug'),
  'word-wrap': () => {
    const { app, updateApp } = useSettingsStore.getState();
    updateApp({ wordWrap: !app.wordWrap });
  },
  'go-back': (ctx) => ctx.navBack(),
  'go-forward': (ctx) => ctx.navForward(),
  'last-edit-location': comingSoon('Last Edit Location'),
  'switch-editor': comingSoon('Switch Editor'),
  'switch-group': comingSoon('Switch Group'),
  'go-to-file': (ctx) => ctx.openQuickOpen(),
  'go-to-symbol-workspace': comingSoon('Go to Symbol in Workspace'),
  'go-to-symbol-editor': () => { triggerMonacoAction(MONACO_ACTIONS.goToSymbolEditor); },
  'go-to-definition': async (ctx) => { await ctx.openDefinition(); },
  'go-to-declaration': () => { triggerMonacoAction(MONACO_ACTIONS.goToDefinition); },
  'go-to-type-definition': comingSoon('Go to Type Definition'),
  'go-to-implementations': comingSoon('Go to Implementations'),
  'add-symbol-current-chat': (ctx) => {
    ctx.toggleAI();
    useAIStore.getState().setIncludeMode('selection');
  },
  'go-to-references': async (ctx) => { await ctx.openReferences(); },
  'add-symbol-new-chat': (ctx) => {
    useAIStore.getState().newThread();
    ctx.toggleAI();
    useAIStore.getState().setIncludeMode('selection');
  },
  'go-to-line': () => { triggerMonacoAction(MONACO_ACTIONS.goToLine); },
  'go-to-bracket': () => { triggerMonacoAction(MONACO_ACTIONS.goToBracket); },
  'next-problem': () => {
    const problem = useProblemsStore.getState().focusNext();
    if (problem) revealProblem(problem, useEditorStore.getState().projectPath);
    else showWorkbenchToast('Nu există probleme');
  },
  'previous-problem': () => {
    const problem = useProblemsStore.getState().focusPrevious();
    if (problem) revealProblem(problem, useEditorStore.getState().projectPath);
    else showWorkbenchToast('Nu există probleme');
  },
  'next-change': comingSoon('Next Change'),
  'previous-change': comingSoon('Previous Change'),
  'run-debug': () => {
    void (window.caval as { debug?: { launch?: () => Promise<unknown> } })?.debug?.launch?.();
  },
  'run-without-debug': () => {
    void (window.caval as { debug?: { launch?: () => Promise<unknown> } })?.debug?.launch?.();
  },
  'stop-debug': () => {
    void (window.caval as {
      debug?: {
        list?: () => Promise<{ sessions?: Array<{ id: string }> }>;
        stop?: (id: string) => Promise<unknown>;
      };
    })?.debug?.list?.().then((res) => {
      const first = res?.sessions?.[0];
      if (first) void (window.caval as { debug?: { stop?: (id: string) => Promise<unknown> } })?.debug?.stop?.(first.id);
    });
  },
  'restart-debug': comingSoon('Restart Debugging'),
  'run-active-file': () => {
    const tab = useEditorStore.getState().tabs.find((t) => t.id === useEditorStore.getState().activeTabId);
    if (!tab) return;
    dispatchRunInTerminal(`node "${tab.path}"`);
    dispatchTerminalPanelTab('terminal');
  },
  'run-selected-text': () => {
    const sel = useEditorStore.getState().editorSelection;
    if (!sel?.text) {
      showWorkbenchToast('Selectează text pentru a rula');
      return;
    }
    dispatchRunInTerminal(sel.text);
    dispatchTerminalPanelTab('terminal');
  },
  'add-run-config': comingSoon('Add Configuration'),
  'terminal-new': () => dispatchTerminalNew(),
  'terminal-split': () => dispatchTerminalSplit(),
  'task-run': comingSoon('Run Task'),
  'task-build': (ctx) => void ctx.runBuild(),
  'tasks-configure': comingSoon('Configure Tasks'),
  'tasks-default-build': (ctx) => void ctx.runBuild(),
  'editor-playground': comingSoon('Editor Playground'),
  accessibility: comingSoon('Accessibility Features'),
  feedback: () => {
    showWorkbenchToast('Feedback: deschide Issues pe GitHub pentru Cavallo Studio.');
  },
  license: (ctx) => {
    ctx.setActiveActivity('settings');
    ctx.setSidebarOpen(true);
    useSettingsStore.getState().setActiveSection('about');
  },
  'process-explorer': comingSoon('Process Explorer'),
  'check-updates': () => showWorkbenchToast('Ești pe ultima versiune locală.'),
  about: (ctx) => {
    ctx.setActiveActivity('settings');
    ctx.setSidebarOpen(true);
    useSettingsStore.getState().setActiveSection('about');
    showWorkbenchToast('CAVALLO™ — © "Dev AI" EOOD');
  },
};

export function handleMenuCommand(command: string, ctx: MenuCommandContext): void {
  const handler = handlers[command as MenuCommandId];
  if (handler) {
    void handler(ctx);
    return;
  }
  console.warn(`[menu] Unknown command: ${command}`);
  showWorkbenchToast(`Comandă necunoscută: ${command}`);
}

export function getMenuCommandHandlers(): Record<MenuCommandId, Handler> {
  return handlers;
}

export function assertAllMenuCommandsHaveHandlers(): void {
  for (const id of MENU_COMMAND_IDS) {
    if (!handlers[id]) {
      throw new Error(`Missing menu handler for ${id}`);
    }
  }
}
