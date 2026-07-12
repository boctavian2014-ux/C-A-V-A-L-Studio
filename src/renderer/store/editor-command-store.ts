import type * as MonacoType from 'monaco-editor';

type MonacoEditor = MonacoType.editor.IStandaloneCodeEditor;

let editorRef: MonacoEditor | null = null;

export function registerMonacoEditor(editor: MonacoEditor | null): void {
  editorRef = editor;
}

export function getMonacoEditor(): MonacoEditor | null {
  return editorRef;
}

export function triggerMonacoAction(actionId: string): boolean {
  const editor = editorRef;
  if (!editor) {
    console.warn('[monaco] No active editor for action:', actionId);
    return false;
  }
  const action = editor.getAction(actionId);
  if (action) {
    void action.run();
    return true;
  }
  editor.trigger('caval', actionId, null);
  return true;
}

export const MONACO_ACTIONS = {
  find: 'actions.find',
  replace: 'editor.action.startFindReplaceAction',
  toggleLineComment: 'editor.action.commentLine',
  toggleBlockComment: 'editor.action.blockComment',
  copyLineUp: 'editor.action.copyLinesUpAction',
  copyLineDown: 'editor.action.copyLinesDownAction',
  moveLineUp: 'editor.action.moveLinesUpAction',
  moveLineDown: 'editor.action.moveLinesDownAction',
  cursorAbove: 'editor.action.insertCursorAbove',
  cursorBelow: 'editor.action.insertCursorBelow',
  goToSymbolEditor: 'editor.action.quickOutline',
  goToLine: 'editor.action.gotoLine',
  goToBracket: 'editor.action.jumpToBracket',
  goToDefinition: 'editor.action.revealDefinition',
  goToReferences: 'editor.action.goToReferences',
  selectionExpand: 'editor.action.smartSelect.expand',
  selectionShrink: 'editor.action.smartSelect.shrink',
  formatDocument: 'editor.action.formatDocument',
} as const;
