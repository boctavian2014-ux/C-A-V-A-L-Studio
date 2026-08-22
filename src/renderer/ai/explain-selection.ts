import { getMonacoEditor } from "../store/editor-command-store";
import { useEditorStore, type EditorSelection } from "../store/editor-store";

/** Read selection from Monaco when available ΓÇö survives toolbar focus changes. */
export function readLiveEditorSelection(): EditorSelection | null {
  const { activeTabId, tabs, editorSelection } = useEditorStore.getState();
  const tab = tabs.find((t) => t.id === activeTabId);
  const editor = getMonacoEditor();

  if (editor && tab) {
    const model = editor.getModel();
    const sel = editor.getSelection();
    if (model && sel && !sel.isEmpty()) {
      const text = model.getValueInRange(sel).trim();
      if (text) {
        return {
          text,
          path: tab.path,
          startLine: sel.startLineNumber,
          endLine: sel.endLineNumber,
          startColumn: sel.startColumn,
          endColumn: sel.endColumn,
        };
      }
    }
  }

  return editorSelection?.text?.trim() ? editorSelection : null;
}
