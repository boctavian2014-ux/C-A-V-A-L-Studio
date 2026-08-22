import type * as MonacoType from "monaco-editor";

import type { ProposedWrite } from "../../src/shared/ai-chat-apply-contract";
import { clipProposedContentForPreview } from "../../src/shared/ai-chat-apply-contract";
import { joinWorkspaceRelativePath } from "./written-files";
import { getMonacoEditor } from "../../src/renderer/store/editor-command-store";
import { useEditorStore } from "../../src/renderer/store/editor-store";
import { useAIStore } from "./ai-store";
import { emitEditorFileWriteTimeline } from "../../src/renderer/ai/inline-completion-timeline";
import { useLiveAiEditsStore } from "./live-ai-edits-store";

/** Apply full-file content via Monaco undo stops when the tab is open. */
export function applyProposedWriteInOpenEditor(
  monacoApi: typeof MonacoType,
  absolutePath: string,
  content: string
): boolean {
  const editor = getMonacoEditor();
  const model = editor?.getModel();
  if (!editor || !model) return false;
  const { tabs, activeTabId } = useEditorStore.getState();
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return false;
  const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();
  if (norm(tab.path) !== norm(absolutePath)) return false;

  const full = model.getFullModelRange();
  editor.pushUndoStop();
  const ok = editor.executeEdits("ai-chat-apply", [
    { range: full, text: content, forceMoveMarkers: true },
  ]);
  editor.pushUndoStop();
  return ok;
}

export async function acceptProposedWritesForMessage(messageId: string): Promise<void> {
  const msg = useAIStore.getState().messages.find((m) => m.id === messageId);
  if (!msg?.proposedWrites?.length) return;

  const caval = window.caval;
  const projectPath = useEditorStore.getState().projectPath;
  if (!caval?.chatApplyAccept || !projectPath) return;

  const result = await caval.chatApplyAccept({
    stageKey: msg.proposeStageKey,
    writes: msg.proposedWrites,
    conversationId: useAIStore.getState().activeThreadId,
    messageId,
    streamId: msg.streamId,
  });
  if (!result.ok) return;

  const appliedWrites = result.writes ?? msg.proposedWrites;
  // Best-effort Monaco undo for currently open matching file
  try {
    const monaco = await import("monaco-editor");
    for (const write of appliedWrites) {
      const abs = joinWorkspaceRelativePath(projectPath, write.path);
      applyProposedWriteInOpenEditor(monaco, abs, write.content);
    }
  } catch {
    // disk already written; editor undo optional
  }

  const timelineEvents: import("../../src/shared/ai-timeline-contract").TimelineEvent[] = [];
  for (const write of appliedWrites) {
    const { timelineEvents: ev } = await emitEditorFileWriteTimeline({
      filePath: write.path,
      detail: write.isNew ? "new file applied from chat" : "chat apply accepted",
    });
    timelineEvents.push(...ev);
  }

  useAIStore.setState((s) => {
    const messages = s.messages.map((m) =>
      m.id === messageId
        ? {
            ...m,
            proposedWrites: undefined,
            proposeStageKey: undefined,
            writtenFiles: result.applied,
            timelineEvents: [...(m.timelineEvents ?? []), ...timelineEvents],
          }
        : m
    );
    const threads = s.threads.map((t) =>
      t.id === s.activeThreadId ? { ...t, messages, updatedAt: Date.now() } : t
    );
    return { messages, threads };
  });

  await useEditorStore.getState().refreshTree();
  useLiveAiEditsStore.getState().clearAll();
}

export async function rejectProposedWritesForMessage(messageId: string): Promise<void> {
  const msg = useAIStore.getState().messages.find((m) => m.id === messageId);
  if (!msg) return;
  await window.caval?.chatApplyReject?.({ stageKey: msg.proposeStageKey });
  useAIStore.setState((s) => {
    const messages = s.messages.map((m) =>
      m.id === messageId
        ? { ...m, proposedWrites: undefined, proposeStageKey: undefined, writtenFiles: [] }
        : m
    );
    const threads = s.threads.map((t) =>
      t.id === s.activeThreadId ? { ...t, messages, updatedAt: Date.now() } : t
    );
    return { messages, threads };
  });
  useLiveAiEditsStore.getState().clearAll();
}

export async function revertAppliedNewWrites(writes: ProposedWrite[]): Promise<void> {
  await window.caval?.chatApplyRevertNew?.({ writes });
  await useEditorStore.getState().refreshTree();
}

export function previewTextsForWrite(write: ProposedWrite): {
  original: string;
  modified: string;
} {
  return {
    original: clipProposedContentForPreview(write.previousContent ?? ""),
    modified: clipProposedContentForPreview(write.content),
  };
}
