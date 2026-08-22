/**
 * Pure helpers to materialize refactor proposals into text (no disk I/O).
 */

import type { RefactorFileEdit } from "./ai-refactor-contract";
import { applyQuickFixEditsToText } from "./ai-quick-fix-contract";
import { normalizeRefactorPath } from "./ai-refactor-contract";

/** Compute original → modified text for a single refactor file edit. */
export function materializeRefactorFile(
  originalText: string,
  file: RefactorFileEdit
): { originalText: string; modifiedText: string } {
  if (file.isDeleted) {
    return {
      originalText: file.deletedContent ?? originalText,
      modifiedText: "",
    };
  }
  if (file.isNew) {
    return {
      originalText: "",
      modifiedText: file.newFileContent ?? "",
    };
  }
  if (file.edits?.length) {
    return {
      originalText,
      modifiedText: applyQuickFixEditsToText(originalText, file.edits),
    };
  }
  if (file.newFileContent != null) {
    return { originalText, modifiedText: file.newFileContent };
  }
  return { originalText, modifiedText: originalText };
}

export function normalizeRefactorPaths(files: RefactorFileEdit[]): RefactorFileEdit[] {
  return files.map((f) => ({
    ...f,
    filePath: normalizeRefactorPath(f.filePath),
  }));
}
