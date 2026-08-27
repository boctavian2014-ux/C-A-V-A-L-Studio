/**
 * Application menu + native context menu — built from i18n catalogs.
 * Rebuild via installApplicationMenu() whenever ui.locale changes.
 */
import { Menu, type BrowserWindow, type ContextMenuParams, type MenuItemConstructorOptions } from "electron";

import { createTranslator, type TranslateFn } from "../../ai/i18n";
import type { AppLocale } from "../shared/i18n-contract";
import { resolveLocale } from "../shared/i18n-contract";

export type AppMenuHandlers = {
  sendMenuCommand: (command: string) => void;
  createWindow: () => void;
  openFile: () => void | Promise<void>;
  openFolder: () => void | Promise<void>;
  focusedWindow: () => BrowserWindow | null | undefined;
  quit: () => void;
  openDocs: () => void;
};

function buildTemplate(t: TranslateFn, h: AppMenuHandlers): MenuItemConstructorOptions[] {
  return [
    {
      label: t("menu.file"),
      submenu: [
        { label: t("menu.newFile"), accelerator: "CmdOrCtrl+N", click: () => h.sendMenuCommand("new-file") },
        { label: t("menu.newWindow"), accelerator: "CmdOrCtrl+Shift+N", click: () => h.createWindow() },
        { type: "separator" },
        { label: t("menu.openFile"), accelerator: "CmdOrCtrl+O", click: () => void h.openFile() },
        { label: t("menu.openFolder"), accelerator: "CmdOrCtrl+Shift+O", click: () => void h.openFolder() },
        { type: "separator" },
        { label: t("menu.save"), accelerator: "CmdOrCtrl+S", click: () => h.sendMenuCommand("save") },
        { label: t("menu.saveAs"), accelerator: "CmdOrCtrl+Shift+S", click: () => h.sendMenuCommand("save-as") },
        { type: "separator" },
        { label: t("menu.preferences"), accelerator: "CmdOrCtrl+,", click: () => h.sendMenuCommand("open-settings") },
        { type: "separator" },
        { label: t("menu.closeWindow"), accelerator: "Alt+F4", click: () => h.focusedWindow()?.close() },
        { label: t("menu.exit"), click: () => h.quit() },
      ],
    },
    {
      label: t("menu.edit"),
      submenu: [
        { role: "undo", label: t("menu.undo") },
        { role: "redo", label: t("menu.redo") },
        { type: "separator" },
        { role: "cut", label: t("menu.cut") },
        { role: "copy", label: t("menu.copy") },
        { role: "paste", label: t("menu.paste") },
        { type: "separator" },
        { label: t("menu.find"), accelerator: "CmdOrCtrl+F", click: () => h.sendMenuCommand("find") },
        { label: t("menu.replace"), accelerator: "CmdOrCtrl+H", click: () => h.sendMenuCommand("replace") },
        { type: "separator" },
        { label: t("menu.findInFiles"), accelerator: "CmdOrCtrl+Shift+F", click: () => h.sendMenuCommand("find-in-files") },
        { label: t("menu.replaceInFiles"), accelerator: "CmdOrCtrl+Shift+H", click: () => h.sendMenuCommand("replace-in-files") },
        { type: "separator" },
        { label: t("menu.toggleLineComment"), accelerator: "CmdOrCtrl+/", click: () => h.sendMenuCommand("toggle-line-comment") },
        { label: t("menu.toggleBlockComment"), accelerator: "Shift+Alt+A", click: () => h.sendMenuCommand("toggle-block-comment") },
        { label: t("menu.emmetExpand"), accelerator: "Tab", click: () => h.sendMenuCommand("emmet-expand") },
        { type: "separator" },
        { role: "selectAll", label: t("menu.selectAll") },
      ],
    },
    {
      label: t("menu.selection"),
      submenu: [
        { label: t("menu.selectAll"), accelerator: "CmdOrCtrl+A", role: "selectAll" },
        { label: t("menu.expandSelection"), accelerator: "Shift+Alt+Right", click: () => h.sendMenuCommand("selection-expand") },
        { label: t("menu.shrinkSelection"), accelerator: "Shift+Alt+Left", click: () => h.sendMenuCommand("selection-shrink") },
        { type: "separator" },
        { label: t("menu.copyLineUp"), accelerator: "Shift+Alt+Up", click: () => h.sendMenuCommand("copy-line-up") },
        { label: t("menu.copyLineDown"), accelerator: "Shift+Alt+Down", click: () => h.sendMenuCommand("copy-line-down") },
        { label: t("menu.moveLineUp"), accelerator: "Alt+Up", click: () => h.sendMenuCommand("move-line-up") },
        { label: t("menu.moveLineDown"), accelerator: "Alt+Down", click: () => h.sendMenuCommand("move-line-down") },
        { type: "separator" },
        { label: t("menu.cursorAbove"), accelerator: "CmdOrCtrl+Alt+Up", click: () => h.sendMenuCommand("cursor-above") },
        { label: t("menu.cursorBelow"), accelerator: "CmdOrCtrl+Alt+Down", click: () => h.sendMenuCommand("cursor-below") },
      ],
    },
    {
      label: t("menu.view"),
      submenu: [
        { label: t("menu.commandPalette"), accelerator: "CmdOrCtrl+Shift+P", click: () => h.sendMenuCommand("palette") },
        { label: t("menu.openView"), click: () => h.sendMenuCommand("open-view") },
        { type: "separator" },
        {
          label: t("menu.appearance"),
          submenu: [
            { label: t("menu.fullScreen"), accelerator: "F11", role: "togglefullscreen" },
            { label: t("menu.zoomIn"), accelerator: "CmdOrCtrl+=", role: "zoomIn" },
            { label: t("menu.zoomOut"), accelerator: "CmdOrCtrl+-", role: "zoomOut" },
            { label: t("menu.resetZoom"), accelerator: "CmdOrCtrl+0", role: "resetZoom" },
          ],
        },
        {
          label: t("menu.editorLayout"),
          submenu: [
            { label: t("menu.splitEditor"), accelerator: "CmdOrCtrl+\\", click: () => h.sendMenuCommand("split-editor") },
            { label: t("menu.singleEditor"), click: () => h.sendMenuCommand("single-editor") },
          ],
        },
        { type: "separator" },
        { label: t("menu.primarySideBar"), accelerator: "CmdOrCtrl+B", click: () => h.sendMenuCommand("toggle-sidebar") },
        { label: t("menu.explorer"), accelerator: "CmdOrCtrl+Shift+E", click: () => h.sendMenuCommand("view-explorer") },
        { label: t("menu.search"), accelerator: "CmdOrCtrl+Shift+F", click: () => h.sendMenuCommand("view-search") },
        { label: t("menu.sourceControl"), click: () => h.sendMenuCommand("view-source-control") },
        { label: t("menu.run"), accelerator: "CmdOrCtrl+Shift+D", click: () => h.sendMenuCommand("view-run") },
        { label: t("menu.extensions"), accelerator: "CmdOrCtrl+Shift+X", click: () => h.sendMenuCommand("view-extensions") },
        { type: "separator" },
        { label: t("menu.problems"), click: () => h.sendMenuCommand("view-problems") },
        { label: t("menu.output"), accelerator: "CmdOrCtrl+Shift+U", click: () => h.sendMenuCommand("view-output") },
        { label: t("menu.debugConsole"), accelerator: "CmdOrCtrl+Shift+Alt+Y", click: () => h.sendMenuCommand("view-debug-console") },
        { type: "separator" },
        { label: t("menu.wordWrap"), accelerator: "Alt+Z", click: () => h.sendMenuCommand("word-wrap") },
        { type: "separator" },
        { role: "reload", label: t("menu.reload") },
        { role: "toggleDevTools", label: t("menu.toggleDevTools") },
      ],
    },
    {
      label: t("menu.go"),
      submenu: [
        { label: t("menu.back"), accelerator: "Alt+Left", click: () => h.sendMenuCommand("go-back") },
        { label: t("menu.forward"), accelerator: "Alt+Right", click: () => h.sendMenuCommand("go-forward") },
        { label: t("menu.lastEditLocation"), accelerator: "CmdOrCtrl+M CmdOrCtrl+Q", click: () => h.sendMenuCommand("last-edit-location") },
        { type: "separator" },
        { label: t("menu.switchEditor"), click: () => h.sendMenuCommand("switch-editor") },
        { label: t("menu.switchGroup"), click: () => h.sendMenuCommand("switch-group") },
        { type: "separator" },
        { label: t("menu.goToFile"), accelerator: "CmdOrCtrl+P", click: () => h.sendMenuCommand("go-to-file") },
        { label: t("menu.goToSymbolWorkspace"), accelerator: "CmdOrCtrl+T", click: () => h.sendMenuCommand("go-to-symbol-workspace") },
        { label: t("menu.goToSymbolEditor"), accelerator: "CmdOrCtrl+Shift+O", click: () => h.sendMenuCommand("go-to-symbol-editor") },
        { label: t("menu.goToDefinition"), accelerator: "F12", click: () => h.sendMenuCommand("go-to-definition") },
        { label: t("menu.goToDeclaration"), click: () => h.sendMenuCommand("go-to-declaration") },
        { label: t("menu.goToTypeDefinition"), click: () => h.sendMenuCommand("go-to-type-definition") },
        { label: t("menu.goToImplementations"), accelerator: "CmdOrCtrl+F12", click: () => h.sendMenuCommand("go-to-implementations") },
        { label: t("menu.addSymbolCurrentChat"), click: () => h.sendMenuCommand("add-symbol-current-chat") },
        { label: t("menu.goToReferences"), accelerator: "Shift+F12", click: () => h.sendMenuCommand("go-to-references") },
        { label: t("menu.addSymbolNewChat"), click: () => h.sendMenuCommand("add-symbol-new-chat") },
        { type: "separator" },
        { label: t("menu.goToLine"), accelerator: "CmdOrCtrl+G", click: () => h.sendMenuCommand("go-to-line") },
        { label: t("menu.goToBracket"), accelerator: "CmdOrCtrl+Shift+\\", click: () => h.sendMenuCommand("go-to-bracket") },
        { type: "separator" },
        { label: t("menu.nextProblem"), accelerator: "F8", click: () => h.sendMenuCommand("next-problem") },
        { label: t("menu.previousProblem"), accelerator: "Shift+F8", click: () => h.sendMenuCommand("previous-problem") },
        { label: t("menu.nextChange"), accelerator: "Alt+F3", click: () => h.sendMenuCommand("next-change") },
        { label: t("menu.previousChange"), accelerator: "Shift+Alt+F3", click: () => h.sendMenuCommand("previous-change") },
      ],
    },
    {
      label: t("menu.run"),
      submenu: [
        { label: t("menu.startDebugging"), accelerator: "F5", click: () => h.sendMenuCommand("run-debug") },
        { label: t("menu.runWithoutDebugging"), accelerator: "CmdOrCtrl+F5", click: () => h.sendMenuCommand("run-without-debug") },
        { label: t("menu.stopDebugging"), accelerator: "Shift+F5", click: () => h.sendMenuCommand("stop-debug") },
        { label: t("menu.restartDebugging"), accelerator: "CmdOrCtrl+Shift+F5", click: () => h.sendMenuCommand("restart-debug") },
        { type: "separator" },
        { label: t("menu.runActiveFile"), click: () => h.sendMenuCommand("run-active-file") },
        { label: t("menu.runSelectedText"), click: () => h.sendMenuCommand("run-selected-text") },
        { type: "separator" },
        { label: t("menu.addConfiguration"), click: () => h.sendMenuCommand("add-run-config") },
      ],
    },
    {
      label: t("menu.terminal"),
      submenu: [
        { label: t("menu.newTerminal"), accelerator: "Ctrl+Shift+`", click: () => h.sendMenuCommand("terminal-new") },
        { label: t("menu.splitTerminal"), accelerator: "Ctrl+Shift+5", click: () => h.sendMenuCommand("terminal-split") },
        { type: "separator" },
        { label: t("menu.runTask"), click: () => h.sendMenuCommand("task-run") },
        { label: t("menu.runBuildTask"), accelerator: "CmdOrCtrl+Shift+B", click: () => h.sendMenuCommand("task-build") },
        { label: t("menu.runActiveFile"), click: () => h.sendMenuCommand("run-active-file") },
        { label: t("menu.runSelectedText"), click: () => h.sendMenuCommand("run-selected-text") },
        { type: "separator" },
        { label: t("menu.configureTasks"), click: () => h.sendMenuCommand("tasks-configure") },
        { label: t("menu.configureDefaultBuildTask"), click: () => h.sendMenuCommand("tasks-default-build") },
      ],
    },
    {
      label: t("menu.help"),
      submenu: [
        { label: t("menu.showAllCommands"), accelerator: "CmdOrCtrl+Shift+P", click: () => h.sendMenuCommand("palette") },
        { label: t("menu.editorPlayground"), click: () => h.sendMenuCommand("editor-playground") },
        { label: t("menu.accessibility"), click: () => h.sendMenuCommand("accessibility") },
        { type: "separator" },
        { label: t("menu.giveFeedback"), click: () => h.sendMenuCommand("feedback") },
        { type: "separator" },
        { label: t("menu.viewLicense"), click: () => h.sendMenuCommand("license") },
        { type: "separator" },
        { label: t("menu.toggleDevTools"), role: "toggleDevTools" },
        { label: t("menu.processExplorer"), click: () => h.sendMenuCommand("process-explorer") },
        { type: "separator" },
        { label: t("menu.checkUpdates"), click: () => h.sendMenuCommand("check-updates") },
        { label: t("menu.docs"), click: () => h.openDocs() },
        { type: "separator" },
        { label: t("menu.about"), click: () => h.sendMenuCommand("about") },
      ],
    },
  ];
}

export function installApplicationMenu(localeInput: string | null | undefined, handlers: AppMenuHandlers): AppLocale {
  const locale = resolveLocale(localeInput);
  const t = createTranslator(locale);
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildTemplate(t, handlers)));
  return locale;
}

export function listApplicationMenuTopLevel(): Array<{ index: number; label: string }> {
  const menu = Menu.getApplicationMenu();
  if (!menu) return [];
  return menu.items
    .map((item, index) => ({ index, label: (item.label ?? "").trim() }))
    .filter((item) => item.label.length > 0);
}

export function popupApplicationSubmenu(
  window: BrowserWindow,
  index: number,
  x: number,
  y: number,
): boolean {
  const item = Menu.getApplicationMenu()?.items[index];
  if (!item?.submenu) return false;
  item.submenu.popup({ window, x: Math.round(x), y: Math.round(y) });
  return true;
}

export function buildRendererContextMenu(
  localeInput: string | null | undefined,
  params: ContextMenuParams
): MenuItemConstructorOptions[] {
  const t = createTranslator(resolveLocale(localeInput));
  const template: MenuItemConstructorOptions[] = [];
  if (params.editFlags.canCopy || params.selectionText) {
    template.push({ role: "copy", label: t("menu.copy") });
  }
  if (params.editFlags.canPaste) {
    template.push({ role: "paste", label: t("menu.paste") });
  }
  if (params.editFlags.canCut) {
    template.push({ role: "cut", label: t("menu.cut") });
  }
  if (template.length > 0) {
    template.push({ type: "separator" });
  }
  if (params.editFlags.canSelectAll) {
    template.push({ role: "selectAll", label: t("menu.selectAll") });
  }
  return template;
}
