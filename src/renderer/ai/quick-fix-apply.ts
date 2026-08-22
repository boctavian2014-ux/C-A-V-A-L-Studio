import type * as MonacoType from "monaco-editor";

import type { QuickFixEdit } from "../../shared/ai-quick-fix-contract";
import { getMonacoEditor } from "../store/editor-command-store";

export type QuickFixMonacoEditor = MonacoType.editor.IStandaloneCodeEditor;

/**
 * Apply AI quick-fix edits with native Monaco undo stops.
 * One Ctrl+Z reverts the entire fix.
 */
export function applyQuickFixEdits(
  editor: QuickFixMonacoEditor,
  monacoApi: typeof MonacoType,
  edits: QuickFixEdit[]
): boolean {
  const model = editor.getModel();
  if (!model || edits.length === 0) return false;

  const monacoEdits = edits.map((edit) => ({
    range: new monacoApi.Range(
      edit.startLine,
      edit.startColumn,
      edit.endLine,
      edit.endColumn
    ),
    text: edit.newText,
    forceMoveMarkers: true,
  }));

  editor.pushUndoStop();
  const ok = editor.executeEdits("ai-quick-fix", monacoEdits);
  editor.pushUndoStop();
  return ok;
}

export function applyQuickFixEditsOnActiveEditor(
  monacoApi: typeof MonacoType,
  edits: QuickFixEdit[]
): boolean {
  const editor = getMonacoEditor();
  if (!editor) return false;
  return applyQuickFixEdits(editor, monacoApi, edits);
}
