import { looksLikeFileCreationPrompt } from "../context-engine/context-builder";
import { looksLikeExplicitCreate } from "../modes/execution-mode";

const SIMPLE_FILE_RE = /[\w./\\-]+\.(txt|md)\b/gi;
const MULTI_PROJECT_RE =
  /\b(proiect(?:\s+nou)?|app complet|fullstack|vite|expo|next\.js|landing|toate fi[șs]ierele)\b/i;

export function isSimpleSingleFileCreateRequest(message: string): boolean {
  const text = message.trim();
  if (!looksLikeFileCreationPrompt(text) && !looksLikeExplicitCreate(text)) return false;
  if (MULTI_PROJECT_RE.test(text)) return false;
  const named = text.match(SIMPLE_FILE_RE) ?? [];
  return named.length === 1;
}

export function areSimpleStandaloneWrittenFiles(writtenFiles: string[]): boolean {
  if (writtenFiles.length === 0) return false;
  return writtenFiles.every((file) => {
    const normalized = file.replace(/\\/g, "/");
    if (/(^|\/)src\//.test(normalized)) return false;
    return /\.(txt|md)$/i.test(normalized);
  });
}

export function shouldRetryScaffoldOnEmptyFences(input: {
  allowWriteFollowup: boolean;
  scaffoldParsed: number;
  createIntent: boolean;
  canApply: boolean;
  autonomousFinish: boolean;
  canContinueRepair: boolean;
}): boolean {
  if (
    !input.allowWriteFollowup ||
    !input.canApply ||
    !input.autonomousFinish ||
    !input.canContinueRepair
  ) {
    return false;
  }
  return input.scaffoldParsed > 0 || input.createIntent;
}

export function shouldSkipGenericViteFallback(
  userMessage: string,
  writtenFiles: string[] = []
): boolean {
  return (
    isSimpleSingleFileCreateRequest(userMessage) || areSimpleStandaloneWrittenFiles(writtenFiles)
  );
}
