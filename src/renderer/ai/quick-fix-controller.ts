import {
  applyQuickFixEditsToText,
  normalizeQuickFixRelPath,
} from "../../shared/ai-quick-fix-contract";
import type { Problem } from "../../shared/problems-contract";
import {
  acceptQuickFixTimeline,
  problemToQuickFixDiagnostic,
  proposeQuickFixFromProblem,
  publishQuickFixTimelineToChat,
  toWorkspaceRelativePath,
} from "./quick-fix-client";
import { applyQuickFixEditsOnActiveEditor } from "./quick-fix-apply";
import { useEditorStore } from "../store/editor-store";
import { useQuickFixStore } from "../store/quick-fix-store";
import { problemToEntry, revealProblem } from "../store/problems-store";

function resolveAbsolutePath(relOrAbs: string, projectPath: string | null): string {
  if (/^[a-zA-Z]:[\\/]/.test(relOrAbs) || relOrAbs.startsWith("/")) return relOrAbs;
  if (!projectPath) return relOrAbs;
  return `${projectPath.replace(/[/\\]+$/, "")}/${relOrAbs.replace(/^[/\\]+/, "")}`;
}

async function readFileText(absolutePath: string): Promise<string | null> {
  const tabs = useEditorStore.getState().tabs;
  const normalized = absolutePath.replace(/\\/g, "/");
  const open = tabs.find((t) => t.path.replace(/\\/g, "/") === normalized);
  if (open?.content != null) return open.content;

  const caval = window.caval as {
    fs?: { readFile?: (p: string) => Promise<{ ok: boolean; content?: string }> };
  };
  const res = await caval.fs?.readFile?.(absolutePath);
  if (res?.ok && typeof res.content === "string") return res.content;
  return null;
}

/** Entry point from ProblemsPanel / Monaco lightbulb. */
export async function startQuickFixForProblem(problem: Problem): Promise<void> {
  const diagnostic = problemToQuickFixDiagnostic(problem);
  if (!diagnostic) {
    useQuickFixStore.getState().setSession({
      phase: "error",
      filePath: problem.file,
      absolutePath: problem.file,
      originalText: "",
      modifiedText: "",
      diagnostic: {
        message: problem.message,
        severity: "error",
        startLine: problem.line,
        startColumn: problem.column,
        endLine: problem.line,
        endColumn: problem.column + 1,
      },
      edits: [],
      error: "Quick fix supports error/warning diagnostics only",
      timelineEvents: [],
    });
    return;
  }

  const projectPath = useEditorStore.getState().projectPath;
  const relPath = toWorkspaceRelativePath(problem.file, projectPath);
  const absolutePath = resolveAbsolutePath(problem.file, projectPath);

  revealProblem(problemToEntry(problem), projectPath);

  useQuickFixStore.getState().setSession({
    phase: "loading",
    filePath: relPath,
    absolutePath,
    originalText: "",
    modifiedText: "",
    diagnostic,
    edits: [],
    timelineEvents: [],
  });

  const originalText = await readFileText(absolutePath);
  if (originalText == null) {
    useQuickFixStore.getState().patchSession({
      phase: "error",
      error: "Could not read file for quick fix",
    });
    return;
  }

  useQuickFixStore.getState().patchSession({ originalText });

  const { streamId, result, timelineEvents } = await proposeQuickFixFromProblem({
    filePath: relPath,
    diagnostic,
  });

  if (!result.success || !result.edits?.length) {
    useQuickFixStore.getState().patchSession({
      phase: "error",
      error: result.error ?? "No edits proposed",
      proposeStreamId: streamId,
      timelineEvents,
    });
    publishQuickFixTimelineToChat({
      content: `Quick fix failed for \`${relPath}\`: ${result.error ?? "no edits"}`,
      timelineEvents,
    });
    return;
  }

  let modifiedText: string;
  try {
    modifiedText = applyQuickFixEditsToText(originalText, result.edits);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Failed to apply preview edits";
    useQuickFixStore.getState().patchSession({
      phase: "error",
      error,
      proposeStreamId: streamId,
      timelineEvents,
    });
    return;
  }

  useQuickFixStore.getState().patchSession({
    phase: "preview",
    edits: result.edits,
    explanation: result.explanation,
    modifiedText,
    proposeStreamId: streamId,
    timelineEvents,
  });
}

export async function acceptQuickFixPreview(
  monacoApi: typeof import("monaco-editor")
): Promise<void> {
  const session = useQuickFixStore.getState().session;
  if (!session || session.phase !== "preview" || !session.edits.length) return;

  useQuickFixStore.getState().patchSession({ phase: "applying" });

  // Ensure target file is active in Monaco before edits.
  revealProblem(
    {
      id: "qf",
      file: session.absolutePath,
      line: session.diagnostic.startLine,
      col: session.diagnostic.startColumn,
      message: session.diagnostic.message,
      severity: session.diagnostic.severity,
    },
    useEditorStore.getState().projectPath
  );

  await new Promise((r) => window.setTimeout(r, 80));

  const applied = applyQuickFixEditsOnActiveEditor(monacoApi, session.edits);
  if (!applied) {
    useQuickFixStore.getState().patchSession({
      phase: "error",
      error: "Could not apply edits in the editor",
    });
    return;
  }

  const { result, timelineEvents } = await acceptQuickFixTimeline({
    filePath: session.filePath,
    editCount: session.edits.length,
  });

  const mergedTimeline = [...session.timelineEvents, ...timelineEvents];
  publishQuickFixTimelineToChat({
    content:
      session.explanation?.trim() ||
      `Applied quick fix to \`${normalizeQuickFixRelPath(session.filePath)}\``,
    timelineEvents: mergedTimeline,
    writtenFiles: result.success ? [session.filePath] : undefined,
  });

  useQuickFixStore.getState().clear();
}

export function rejectQuickFixPreview(): void {
  const session = useQuickFixStore.getState().session;
  if (session?.timelineEvents.length) {
    publishQuickFixTimelineToChat({
      content: `Quick fix discarded for \`${session.filePath}\``,
      timelineEvents: session.timelineEvents,
    });
  }
  useQuickFixStore.getState().clear();
}
