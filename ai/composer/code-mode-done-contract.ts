import { looksLikeFileCreationPrompt } from "../context-engine/context-builder";
import { looksLikeExplicitCreate, looksLikeProductBuildIntent } from "../modes/execution-mode";
import { isBlockedScaffoldPath } from "./scaffold-parser";

const MULTI_PROJECT_RE =
  /\b(proiect(?:\s+nou)?|app complet|fullstack|vite|expo|next\.js|landing|website|site|magazin|shop|store|aplica[țt]ie|toate fi[șs]ierele)\b/i;
const MINIMAL_VITE_SCAFFOLD_RE =
  /\b(?:creeaz[ăa]|create|genereaz[ăa]|build)\s+(?:un\s+)?scaffold\s+vite\s+minim\b/i;
const UNAMBIGUOUS_CREATE_RE =
  /^(?:creeaz[ăa]|create|genereaz[ăa]|scrie)\s+(?:(?:un|o|fi[șs]ier(?:ul)?)\s+)?([\w][\w./\\-]*\.(?:txt|md))\s+(?:cu|with|:)\s+(.+)$/i;

export const AMBIGUOUS_SINGLE_FILE_WRITE_ERROR =
  "Nu am putut extrage un path și un conținut neechivoce. Nu scriu un proiect Vite și nu schimb extensia fișierului.";

export function isSimpleSingleFileCreateRequest(message: string): boolean {
  const text = message.trim();
  if (!looksLikeFileCreationPrompt(text) && !looksLikeExplicitCreate(text)) return false;
  if (looksLikeProductBuildIntent(text) || MULTI_PROJECT_RE.test(text)) return false;
  const named = text.match(/[\w./\\-]+\.(txt|md)\b/gi) ?? [];
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

function normalizeExplicitRelPath(raw: string): string | null {
  const normalized = raw.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || normalized.includes(":")) return null;
  if (isBlockedScaffoldPath(normalized)) return null;
  return normalized;
}

/**
 * Conservative parser for „Creează hello.txt cu Hello”.
 * Returns null unless path + content are unambiguous — caller must error, not Vite.
 */
export function parseUnambiguousSingleFileCreate(
  message: string
): { path: string; content: string } | null {
  const text = message.trim();
  if (!text) return null;
  if (looksLikeProductBuildIntent(text) || isExplicitMinimalViteScaffoldRequest(text)) return null;
  if (MULTI_PROJECT_RE.test(text)) return null;
  if (!looksLikeFileCreationPrompt(text) && !looksLikeExplicitCreate(text)) return null;

  const named = text.match(/[\w./\\-]+\.(txt|md)\b/gi) ?? [];
  if (named.length !== 1) return null;

  const match = text.match(UNAMBIGUOUS_CREATE_RE);
  if (!match) return null;

  const path = normalizeExplicitRelPath(match[1] ?? "");
  if (!path) return null;

  let content = (match[2] ?? "").trim();
  if (
    (content.startsWith('"') && content.endsWith('"') && content.length >= 2) ||
    (content.startsWith("'") && content.endsWith("'") && content.length >= 2)
  ) {
    content = content.slice(1, -1);
  }
  if (!content) return null;
  if (MULTI_PROJECT_RE.test(content) || looksLikeProductBuildIntent(content)) return null;
  if (/\r|\n/.test(content)) return null;
  return { path, content };
}

/** Explicit Vite / unambiguous single-file must not wait on another model round. */
export function shouldSkipEmptyFenceRetry(userMessage: string): boolean {
  return (
    isExplicitMinimalViteScaffoldRequest(userMessage) ||
    Boolean(parseUnambiguousSingleFileCreate(userMessage))
  );
}

export function buildZeroFenceWriteError(userMessage: string): string {
  if (shouldSkipGenericViteFallback(userMessage)) {
    return "Răspunsul nu conține blocuri ```lang:path``` de scris pe disc. Retrimite — pentru un singur fișier .txt/.md nu generez un proiect Vite.";
  }
  return "Nu am primit fișiere valide de la model. Reîncearcă, schimbă modelul sau deschide în Code. Pentru scaffold explicit, cere „Creează scaffold Vite minim”.";
}
