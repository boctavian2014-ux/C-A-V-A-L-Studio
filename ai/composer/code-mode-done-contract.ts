import { looksLikeFileCreationPrompt } from "../context-engine/context-builder";
import { looksLikeExplicitCreate, looksLikeProductBuildIntent } from "../modes/execution-mode";

const SIMPLE_FILE_RE = /[\w./\\-]+\.(txt|md)\b/gi;
const MULTI_PROJECT_RE =
  /\b(proiect(?:\s+nou)?|app complet|fullstack|vite|expo|next\.js|landing|website|site|magazin|shop|store|aplica[țt]ie|toate fi[șs]ierele)\b/i;
const MINIMAL_VITE_SCAFFOLD_RE =
  /\b(?:creeaz[ăa]|create|genereaz[ăa]|build)\s+(?:un\s+)?scaffold\s+vite\s+minim\b/i;

export function isSimpleSingleFileCreateRequest(message: string): boolean {
  const text = message.trim();
  if (!looksLikeFileCreationPrompt(text) && !looksLikeExplicitCreate(text)) return false;
  if (looksLikeProductBuildIntent(text) || MULTI_PROJECT_RE.test(text)) return false;
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

export function isExplicitMinimalViteScaffoldRequest(userMessage: string): boolean {
  return MINIMAL_VITE_SCAFFOLD_RE.test(userMessage.trim());
}

export function buildZeroFenceWriteError(userMessage: string): string {
  if (shouldSkipGenericViteFallback(userMessage)) {
    return "Răspunsul nu conține blocuri ```lang:path``` de scris pe disc. Retrimite — pentru un singur fișier .txt/.md nu generez un proiect Vite.";
  }
  return "Nu am primit fișiere valide de la model. Reîncearcă, schimbă modelul sau deschide în Code. Pentru scaffold explicit, cere „Creează scaffold Vite minim”.";
}
