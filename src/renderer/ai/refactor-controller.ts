import type * as MonacoType from "monaco-editor";

import type { RefactorFileEdit } from "../../shared/ai-refactor-contract";
import { materializeRefactorFile } from "../../shared/ai-refactor-apply";
import { joinWorkspaceRelativePath } from "../../../ai/composer/written-files";
import { applyQuickFixEdits } from "./quick-fix-apply";
import { applyProposedWriteInOpenEditor } from "../../../ai/composer/chat-apply-controller";
import { emitEditorFileWriteTimeline } from "./inline-completion-timeline";
import {
  publishRefactorTimelineToChat,
  requestRefactor,
} from "./refactor-client";
import { toWorkspaceRelativePath } from "./quick-fix-client";
import { getMonacoEditor } from "../store/editor-command-store";
import { useEditorStore } from "../store/editor-store";
import {
  useRefactorStore,
  type RefactorPreviewFile,
} from "../store/refactor-store";
import type { TimelineEvent } from "../../shared/ai-timeline-contract";
import type { RefactorKind } from "../../shared/ai-refactor-contract";

function resolveAbs(relOrAbs: string, projectPath: string | null): string {
  if (/^[a-zA-Z]:[\\/]/.test(relOrAbs) || relOrAbs.startsWith("/")) return relOrAbs;
  if (!projectPath) return relOrAbs;
  return joinWorkspaceRelativePath(projectPath, relOrAbs);
}

async function readWorkspaceFile(absolutePath: string): Promise<string> {
  const tabs = useEditorStore.getState().tabs;
  const norm = absolutePath.replace(/\\/g, "/").toLowerCase();
  const open = tabs.find((t) => t.path.replace(/\\/g, "/").toLowerCase() === norm);
  if (open?.content != null) return open.content;
  const res = await window.caval?.fs?.readFile?.(absolutePath);
  if (res?.ok && typeof res.content === "string") return res.content;
  return "";
}

async function writeWorkspaceFile(absolutePath: string, content: string): Promise<boolean> {
  const res = await window.caval?.fs?.writeFile?.(absolutePath, content);
  return Boolean(res?.ok);
}

async function deleteWorkspaceFile(absolutePath: string): Promise<boolean> {
  const res = await window.caval?.fs?.delete?.(absolutePath);
  return Boolean(res?.ok);
}

function normPath(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

async function ensureTabOpen(absolutePath: string): Promise<void> {
  const { tabs, openFile, setActiveTab } = useEditorStore.getState();
  const existing = tabs.find((t) => normPath(t.path) === normPath(absolutePath));
  if (existing) {
    setActiveTab(existing.id);
  } else {
    await openFile(absolutePath);
  }
  await new Promise((r) => window.setTimeout(r, 80));
}

/** Apply one file: Monaco undo when open + edits; disk write/delete otherwise. */
export async function applyOneRefactorFile(
  monacoApi: typeof MonacoType,
  file: RefactorPreviewFile,
  projectPath: string | null
): Promise<void> {
  const abs = resolveAbs(file.filePath, projectPath);

  if (file.edit.isDeleted) {
    await deleteWorkspaceFile(abs);
    return;
  }

  if (file.edit.isNew) {
    await writeWorkspaceFile(abs, file.modifiedText);
    return;
  }

  if (file.edit.edits?.length) {
    await ensureTabOpen(abs);
    const editor = getMonacoEditor();
    const tab = useEditorStore.getState().tabs.find(
      (t) => t.id === useEditorStore.getState().activeTabId
    );
    if (editor && tab && normPath(tab.path) === normPath(abs)) {
      applyQuickFixEdits(editor, monacoApi, file.edit.edits);
    }
  } else {
    await ensureTabOpen(abs);
    applyProposedWriteInOpenEditor(monacoApi, abs, file.modifiedText);
  }

  await writeWorkspaceFile(abs, file.modifiedText);
}

export async function startRefactorFromSelection(
  kind: RefactorKind = "custom"
): Promise<void> {
  const { editorSelection, projectPath, tabs, activeTabId, activeSymbol } =
    useEditorStore.getState();
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) {
    useRefactorStore.getState().setSession({
      phase: "error",
      kind,
      files: [],
      error: "Open a file to refactor",
      timelineEvents: [],
    });
    return;
  }

  const rel = toWorkspaceRelativePath(tab.path, projectPath);
  const symbol = activeSymbol?.trim() || undefined;
  const selection = editorSelection?.text?.trim()
    ? {
        filePath: rel,
        startLine: editorSelection.startLine,
        startColumn: editorSelection.startColumn,
        endLine: editorSelection.endLine,
        endColumn: editorSelection.endColumn,
        text: editorSelection.text,
      }
    : undefined;

  if (!symbol && !selection) {
    useRefactorStore.getState().setSession({
      phase: "error",
      kind,
      files: [],
      error: "Select code or place the cursor on a symbol",
      timelineEvents: [],
    });
    return;
  }

  useRefactorStore.getState().setSession({
    phase: "loading",
    kind,
    files: [],
    timelineEvents: [],
  });

  const instruction =
    kind === "custom"
      ? selection
        ? `Refactor the selected code cleanly across related files.`
        : `Rename/refactor symbol ${symbol} across related files.`
      : undefined;

  const { result, timelineEvents } = await requestRefactor({
    kind,
    symbol,
    selection,
    instruction,
  });

  if (!result.success || !result.files?.length) {
    useRefactorStore.getState().patch({
      phase: "error",
      error: result.error ?? "No refactor proposed",
      timelineEvents,
    });
    publishRefactorTimelineToChat({
      content: `Refactor failed: ${result.error ?? "no files"}`,
      timelineEvents,
    });
    return;
  }

  const previews: RefactorPreviewFile[] = [];
  for (const file of result.files) {
    const abs = resolveAbs(file.filePath, projectPath);
    const original =
      file.isNew
        ? ""
        : file.isDeleted && file.deletedContent != null
          ? file.deletedContent
          : await readWorkspaceFile(abs);
    const { originalText, modifiedText } = materializeRefactorFile(original, file);
    previews.push({
      filePath: file.filePath,
      originalText,
      modifiedText,
      edit: {
        ...file,
        ...(file.isDeleted && !file.deletedContent ? { deletedContent: original } : {}),
      },
    });
  }

  useRefactorStore.getState().patch({
    phase: "preview",
    files: previews,
    activePath: previews[0]?.filePath,
    explanation: result.explanation,
    timelineEvents,
  });
}

export async function acceptRefactorPreview(monacoApi: typeof MonacoType): Promise<void> {
  const session = useRefactorStore.getState().session;
  if (!session || session.phase !== "preview" || !session.files.length) return;

  useRefactorStore.getState().patch({ phase: "applying" });
  const projectPath = useEditorStore.getState().projectPath;
  const timelineExtra: TimelineEvent[] = [];
  const written: string[] = [];

  for (const file of session.files) {
    await applyOneRefactorFile(monacoApi, file, projectPath);
    const { timelineEvents } = await emitEditorFileWriteTimeline({
      filePath: file.filePath,
      detail: file.edit.isNew
        ? "refactor new file"
        : file.edit.isDeleted
          ? "refactor deleted file"
          : "refactor applied",
    });
    timelineExtra.push(...timelineEvents);
    written.push(file.filePath);
  }

  publishRefactorTimelineToChat({
    content:
      session.explanation?.trim() ||
      `Applied refactor (${session.kind}) to ${written.length} file(s)`,
    timelineEvents: [...session.timelineEvents, ...timelineExtra],
    writtenFiles: written,
  });

  useRefactorStore.getState().setLastApplied(session.files);
  await useEditorStore.getState().refreshTree();
  useRefactorStore.getState().clear();
}

export function rejectRefactorPreview(): void {
  const session = useRefactorStore.getState().session;
  if (session?.timelineEvents.length) {
    publishRefactorTimelineToChat({
      content: `Refactor discarded (${session.kind})`,
      timelineEvents: session.timelineEvents,
    });
  }
  useRefactorStore.getState().clear();
}

/** Revert new (delete) / deleted (restore) files from the last Accept. */
export async function revertLastRefactorApply(): Promise<void> {
  const files = useRefactorStore.getState().lastApplied;
  if (!files?.length) return;
  const projectPath = useEditorStore.getState().projectPath;
  for (const file of files) {
    const abs = resolveAbs(file.filePath, projectPath);
    if (file.edit.isNew) {
      await deleteWorkspaceFile(abs);
    } else if (file.edit.isDeleted) {
      await writeWorkspaceFile(
        abs,
        file.originalText || file.edit.deletedContent || ""
      );
    }
  }
  useRefactorStore.getState().setLastApplied(null);
  await useEditorStore.getState().refreshTree();
}

export function buildPreviewFromFiles(
  files: RefactorFileEdit[],
  originals: Record<string, string>
): RefactorPreviewFile[] {
  return files.map((file) => {
    const original = originals[file.filePath] ?? "";
    const { originalText, modifiedText } = materializeRefactorFile(original, file);
    return { filePath: file.filePath, originalText, modifiedText, edit: file };
  });
}
