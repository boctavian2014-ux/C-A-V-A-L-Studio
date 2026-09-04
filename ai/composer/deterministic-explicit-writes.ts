import {
  AMBIGUOUS_SINGLE_FILE_WRITE_ERROR,
  isExplicitMinimalViteScaffoldRequest,
  parseUnambiguousSingleFileCreate,
  shouldSkipGenericViteFallback,
} from "./code-mode-done-contract";
import {
  applyExplicitMinimalViteScaffold,
  INCOMPLETE_VITE_SCAFFOLD_ERROR,
  missingMinimalViteManifest,
} from "./fallback-scaffold";
import { applyScaffoldToWorkspace } from "./scaffold-apply";
import type { ParsedScaffoldFile } from "./scaffold-parser";

export type DeterministicWriteKind = "vite" | "single-file" | "none";

export interface DeterministicExplicitWriteResult {
  kind: DeterministicWriteKind;
  written: string[];
  errors: string[];
  missing: string[];
  complete: boolean;
  usedViteGenerator: boolean;
  errorMessage?: string;
}

function normalizeRel(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function filterParsedScaffoldFilesForUserMessage(
  files: ParsedScaffoldFile[],
  userMessage: string
): ParsedScaffoldFile[] {
  const exact = parseUnambiguousSingleFileCreate(userMessage);
  if (!exact) return files;
  return files.filter((file) => normalizeRel(file.path) === exact.path);
}

export function restrictWrittenFilesToUnambiguousPath(
  writtenFiles: string[],
  userMessage: string
): string[] {
  const exact = parseUnambiguousSingleFileCreate(userMessage);
  if (!exact) return writtenFiles;
  return writtenFiles.filter((file) => normalizeRel(file) === exact.path);
}

export function formatIncompleteViteScaffoldError(missing: string[]): string {
  const list = missing.filter(Boolean).join(", ");
  return list ? `Scaffold incomplet: lipsesc ${list}.` : INCOMPLETE_VITE_SCAFFOLD_ERROR;
}

/**
 * After fences/retry fail or timeout: write explicit Vite via the internal
 * generator, or an unambiguous single file. Product prompts stay kind "none".
 */
export async function recoverDeterministicExplicitWrites(input: {
  userMessage: string;
  projectPath: string;
  writtenFiles: string[];
  projectName?: string;
}): Promise<DeterministicExplicitWriteResult> {
  const writtenFiles = input.writtenFiles.map(normalizeRel);

  if (isExplicitMinimalViteScaffoldRequest(input.userMessage)) {
    const result = await applyExplicitMinimalViteScaffold(input.projectPath, {
      projectName: input.projectName,
    });
    const all = [...new Set([...writtenFiles, ...result.written.map(normalizeRel)])];
    const missing = missingMinimalViteManifest(all);
    const complete = missing.length === 0 && result.errors.length === 0;
    return {
      kind: "vite",
      written: result.written,
      errors: result.errors,
      missing,
      complete,
      usedViteGenerator: true,
      errorMessage: complete ? undefined : formatIncompleteViteScaffoldError(missing),
    };
  }

  const exact = parseUnambiguousSingleFileCreate(input.userMessage);
  if (exact) {
    if (writtenFiles.includes(exact.path)) {
      return {
        kind: "single-file",
        written: [],
        errors: [],
        missing: [],
        complete: true,
        usedViteGenerator: false,
      };
    }
    const applied = await applyScaffoldToWorkspace(input.projectPath, [
      { path: exact.path, content: exact.content },
    ]);
    const gotIt = applied.written.some((file) => normalizeRel(file) === exact.path);
    return {
      kind: "single-file",
      written: applied.written,
      errors: applied.errors,
      missing: gotIt ? [] : [exact.path],
      complete: gotIt && applied.errors.length === 0,
      usedViteGenerator: false,
      errorMessage: gotIt
        ? undefined
        : applied.errors[0] || AMBIGUOUS_SINGLE_FILE_WRITE_ERROR,
    };
  }

  return {
    kind: "none",
    written: [],
    errors: [],
    missing: [],
    complete: false,
    usedViteGenerator: false,
    errorMessage: shouldSkipGenericViteFallback(input.userMessage)
      ? AMBIGUOUS_SINGLE_FILE_WRITE_ERROR
      : undefined,
  };
}
