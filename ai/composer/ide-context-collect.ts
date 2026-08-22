import type { IdeContextPayload } from "../../src/shared/ai-context-contract";
import { sanitizeIdeContextPayload } from "../../src/shared/ai-context-prepare";
import { useEditorStore } from "../../src/renderer/store/editor-store";
import { useGitStore } from "../../src/renderer/store/git-store";
import { useOutputStore } from "../../src/renderer/store/output-store";
import { useProblemsStore } from "../../src/renderer/store/problems-store";

/**
 * Build a renderer-side IDE snapshot from already-loaded store state.
 * Does not call main services; does not send workspaceRoot as authority.
 */
export function collectRendererIdeContext(): IdeContextPayload | undefined {
  const editor = useEditorStore.getState();
  const activeTab = editor.tabs.find((t) => t.id === editor.activeTabId) ?? null;
  const selection = editor.editorSelection;

  const activeFile =
    activeTab != null
      ? {
          path: activeTab.path,
          language: activeTab.language || "plaintext",
          ...(selection &&
          selection.path === activeTab.path &&
          selection.text.trim().length > 0
            ? {
                selection: {
                  startLine: selection.startLine,
                  startColumn: 1,
                  endLine: selection.endLine,
                  endColumn: 1,
                  text: selection.text,
                },
              }
            : activeTab.content
              ? { content: activeTab.content }
              : {}),
        }
      : undefined;

  const problems = useProblemsStore.getState().problems.map((p) => ({
    file: p.file,
    line: p.line,
    column: p.col,
    severity: (p.severity === "error" || p.severity === "warning" || p.severity === "info"
      ? p.severity
      : "warning") as "error" | "warning" | "info" | "hint",
    source: p.source ?? "caval",
    message: p.message,
  }));

  const gitState = useGitStore.getState();
  const git =
    gitState.isRepo || gitState.branch || gitState.files.length
      ? {
          ...(gitState.branch ? { branch: gitState.branch } : {}),
          changedFiles: gitState.files.map((f) => f.path),
        }
      : undefined;

  const output = useOutputStore.getState();
  const channel =
    output.channels.find((c) => c.name === output.activeChannel) ?? output.channels[0];
  const outputTail = channel?.lines.length
    ? channel.lines.slice(-80).join("\n")
    : undefined;

  return sanitizeIdeContextPayload({
    ...(activeFile ? { activeFile } : {}),
    ...(problems.length ? { problems } : {}),
    ...(git ? { git } : {}),
    ...(outputTail ? { outputTail } : {}),
  });
}
