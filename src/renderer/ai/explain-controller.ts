import {
  assertSelectionWithinCap,
  publishExplainTimelineToChat,
  requestExplain,
} from "./explain-client";
import { toWorkspaceRelativePath } from "./quick-fix-client";
import { useEditorStore } from "../store/editor-store";
import { useExplainPanelStore } from "../store/explain-panel-store";

/** Selection entry — opens ephemeral panel; never calls executeEdits. */
export async function startExplainForSelection(): Promise<void> {
  const { editorSelection, projectPath, tabs, activeTabId } = useEditorStore.getState();
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!editorSelection?.text?.trim() || !tab) {
    useExplainPanelStore.getState().setPanel({
      phase: "error",
      filePath: tab?.path ?? "",
      selection: {
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
        text: "",
      },
      error: "Select code to explain",
    });
    return;
  }

  const oversize = assertSelectionWithinCap(editorSelection.text);
  if (oversize) {
    useExplainPanelStore.getState().setPanel({
      phase: "error",
      filePath: toWorkspaceRelativePath(tab.path, projectPath),
      selection: {
        startLine: editorSelection.startLine,
        startColumn: editorSelection.startColumn,
        endLine: editorSelection.endLine,
        endColumn: editorSelection.endColumn,
        text: editorSelection.text,
      },
      error: oversize,
    });
    return;
  }

  const rel = toWorkspaceRelativePath(tab.path, projectPath);
  const selection = {
    startLine: editorSelection.startLine,
    startColumn: editorSelection.startColumn,
    endLine: editorSelection.endLine,
    endColumn: editorSelection.endColumn,
    text: editorSelection.text,
  };

  useExplainPanelStore.getState().setPanel({
    phase: "loading",
    filePath: rel,
    selection,
  });

  const { result, timelineEvents } = await requestExplain({
    filePath: tab.path,
    selection,
    language: tab.language,
  });

  publishExplainTimelineToChat({
    content: `Explain selection in \`${rel}\``,
    timelineEvents,
  });

  if (!result.success || !result.explanation) {
    useExplainPanelStore.getState().patch({
      phase: "error",
      error: result.error ?? "Explain failed",
    });
    return;
  }

  useExplainPanelStore.getState().patch({
    phase: "ready",
    explanation: result.explanation,
  });
}
