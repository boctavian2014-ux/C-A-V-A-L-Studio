/**
 * Execution capability for a chat turn. Main resolves this from the user
 * message. Renderer-requested modes may only reduce privileges.
 */
import { isAgenticRepairRequest } from "../prompts/agentic-repair";
import { isDeliveryContinueRequest } from "../prompts/full-delivery-rule";
import { isScaffoldContinueRequest } from "../prompts/scaffold-emission-rule";
import { isArenaContinueRequest } from "../prompts/arena-continue";

export type ExecutionMode =
  | "READ_ONLY"
  | "PROPOSE_EDIT"
  | "APPLY_EDIT"
  | "AGENTIC_REPAIR"
  | "SCAFFOLD";

const READ_ONLY_RE =
  /(?:^|[\s"'„”])(?:explic[ăa](?!ții)|explain|ce\s+face|ce\s+rol|rolul\s+(?:fi[șs]ierului|lui)|what\s+(?:does|is)|how\s+does|analizeaz[ăa]|analyze|analys[e]?|inspect|cite[șs]te|read(?:\s+the)?|arat[ăa]-mi|show\s+me|spune-mi|tell\s+me|întrebare|descrie|describe|unde\s+(?:ai\s+)?r[ăa]mas|where\s+(?:you\s+|we\s+)?left\s+off|verific[ăa]\s+folderul|check\s+the\s+folder)/i;

const APPLY_RE =
  /(?:^|[\s"'„”])(?:aplic[ăa](?:\s+(?:schimbarea|modificarea|diff(?:-ul)?|schimb[ăa]rile))?|accept(?:\s+(?:the\s+)?(?:change|diff|write))?|apply(?:\s+the\s+)?(?:change|diff)?)/i;

/** Explicit create/edit intent — no \b (Romanian diacritics break JS word boundaries). */
const CREATE_RE =
  /(?:^|[\s"'„”])(?:te\s+rog\s+(?:s[ăa]\s+)?)?(?:[îi]mi\s+)?(?:creeaz|genereaz|implementeaz|construie[șs]t|create|scaffold|from\s+scratch|proiect\s+nou|app\s+complet|full\s+app|landing|toate\s+fi[șs]ierele|build(?:\s+(?:me\s+)?(?:a|an|the|app|full))?|make\s+(?:me\s+)?(?:a|an|the)\b|adaug[ăa]\s+(?:un|o|fi[șs]ier))/i;

/**
 * Product/app brief — user names the deliverable, not file paths.
 * "fă un site / magazin / landing" is enough; do not require "Creează src/App.tsx".
 */
const PRODUCT_NOUN =
  "(?:site|website|landing|magazin|shop|store|app|aplica[țt]ie|proiect|pagin[ăa]|portal|platform[ăa])";
const PRODUCT_BUILD_RE = new RegExp(
  `(?:f[ăa]|fa)\\s+(?:un|o|mi|mie)\\s+${PRODUCT_NOUN}` +
    `|(?:creeaz[ăa]?|genereaz[ăa]?|construie[șs]te?|implementeaz[ăa]?|create|build|make)\\w*\\s+(?:(?:un|o|a|an|the|mi)\\s+)?${PRODUCT_NOUN}` +
    `|\\b(?:landing\\s*page|pagin[ăa]\\s+de\\s+prezentare|site\\s+de|magazin\\s+online|e-?commerce|web\\s*app|proiect\\s+nou|app\\s+complet|creeaz[ăa]\\s+proiectul)\\b`,
  "i"
);

/** Explicit request to materialize files in the open workspace (not propose-only). */
const EXPLICIT_WRITE_RE =
  /(?:scrie\s+efectiv|write\s+(?:the\s+)?files|pe\s+disc|on\s+disk|în\s+(?:folderul\s+curent|workspace)|in\s+(?:the\s+)?(?:current\s+)?(?:folder|workspace)|toate\s+fi[șs]ierele(?:\s+necesare)?|nu\s+r[ăa]spunde\s+doar\s+cu\s+explica[țt]ii|previzualiza|preview\s+local)/i;

export function allowsDiskWrites(mode: ExecutionMode): boolean {
  return mode === "APPLY_EDIT" || mode === "AGENTIC_REPAIR" || mode === "SCAFFOLD";
}

/** Vague product brief — Caval infers the file tree; user does not list paths. */
export function looksLikeProductBuildIntent(message: string): boolean {
  return PRODUCT_BUILD_RE.test(message.trim());
}

export function looksLikeExplicitCreate(message: string): boolean {
  const text = message.trim();
  return CREATE_RE.test(text) || looksLikeProductBuildIntent(text);
}

export function looksLikeExplicitWriteRequest(message: string): boolean {
  return EXPLICIT_WRITE_RE.test(message.trim());
}

/** Create/scaffold a project and write files — not the propose-first edit path. */
export function looksLikeScaffoldCreate(message: string): boolean {
  const text = message.trim();
  // Product briefs ("fă un landing / site / magazin") write to the open folder.
  // The user does not need to say "pe disc" / "în folderul curent".
  if (looksLikeProductBuildIntent(text)) return true;
  return looksLikeExplicitCreate(text) && looksLikeExplicitWriteRequest(text);
}

/** Checklists stay in Plan; simple explain stays in Ask. */
const AUDIT_LIST_RE =
  /(?:^|[\s"'„”])(?:verific[ăa]\s+proiect(?:ul)?|check\s+(?:the\s+)?project|f[ăa]\s+o\s+list[ăa]|fa\s+o\s+lista|make\s+a\s+list|checklist|ce\s+mai\s+avem\s+de\s+f[ăa]cut|ce\s+lipse[șs]te|remaining\s+work|p[âa]n[ăa]\s+la\s+production|until\s+production|production[-\s]?ready|go[\s-]?live|audit(?:eaz[ăa])?\s+(?:proiect(?:ul)?|the\s+project))/i;

export function promptModeForReadOnlyRequest(message: string): "ask" | "plan" {
  return AUDIT_LIST_RE.test(message.trim()) ? "plan" : "ask";
}

/** Code / Agentic / Debug: create turns write; Ask / Plan stay explain + propose. */
export function uiModeGrantsCreateWrites(agentMode?: string): boolean {
  return agentMode === "code" || agentMode === "agentic" || agentMode === "debug";
}

export function isStrictReadOnlyUiMode(agentMode?: string): boolean {
  return agentMode === "ask" || agentMode === "plan";
}

/**
 * Main-owned intent from the original user message.
 * UI Code / Agentic / Debug may grant a write turn; Ask / Plan cannot raise privileges.
 */
export function resolveExecutionMode(message: string, agentMode?: string): ExecutionMode {
  const text = message.trim();
  if (isStrictReadOnlyUiMode(agentMode)) return "READ_ONLY";
  if (!text) return uiModeGrantsCreateWrites(agentMode) ? "SCAFFOLD" : "READ_ONLY";

  if (isAgenticRepairRequest(text)) {
    return "AGENTIC_REPAIR";
  }
  if (
    isScaffoldContinueRequest(text) ||
    isDeliveryContinueRequest(text) ||
    isArenaContinueRequest(text)
  ) {
    return "SCAFFOLD";
  }
  if (APPLY_RE.test(text)) return "APPLY_EDIT";
  if (uiModeGrantsCreateWrites(agentMode)) return "SCAFFOLD";
  if (looksLikeScaffoldCreate(text)) return "SCAFFOLD";
  if (READ_ONLY_RE.test(text) || AUDIT_LIST_RE.test(text)) return "READ_ONLY";
  if (looksLikeExplicitCreate(text)) return "PROPOSE_EDIT";
  return "READ_ONLY";
}

/** Lower rank = stricter (fewer privileges). Renderer may only move left, never right. */
export const EXECUTION_PERMISSION_RANK: Record<ExecutionMode, number> = {
  READ_ONLY: 0,
  PROPOSE_EDIT: 1,
  APPLY_EDIT: 2,
  AGENTIC_REPAIR: 3,
  SCAFFOLD: 4,
};

const EXECUTION_MODES = new Set<ExecutionMode>([
  "READ_ONLY",
  "PROPOSE_EDIT",
  "APPLY_EDIT",
  "AGENTIC_REPAIR",
  "SCAFFOLD",
]);

export interface TrustedExecutionCapability {
  mainResolved: ExecutionMode;
  rendererRequested?: ExecutionMode;
  effective: ExecutionMode;
}

/** Ignore unknown/client-invented mode names. */
export function parseRendererExecutionMode(raw: unknown): ExecutionMode | undefined {
  return typeof raw === "string" && EXECUTION_MODES.has(raw as ExecutionMode)
    ? (raw as ExecutionMode)
    : undefined;
}

export function stricterExecutionMode(a: ExecutionMode, b: ExecutionMode): ExecutionMode {
  return EXECUTION_PERMISSION_RANK[a] <= EXECUTION_PERMISSION_RANK[b] ? a : b;
}

/**
 * Main-owned capability. `rendererRequestedMode` may only reduce privileges.
 */
export function resolveTrustedExecutionCapability(input: {
  userMessage: string;
  rendererRequestedMode?: unknown;
  agentMode?: string;
}): TrustedExecutionCapability {
  const mainResolved = resolveExecutionMode(input.userMessage, input.agentMode);
  const rendererRequested = parseRendererExecutionMode(input.rendererRequestedMode);
  return {
    mainResolved,
    rendererRequested,
    effective: rendererRequested
      ? stricterExecutionMode(mainResolved, rendererRequested)
      : mainResolved,
  };
}

/** Multi-agent compose may propose files; explain/read-only never enters it. */
export function allowsProposedOrWritePipeline(mode: ExecutionMode): boolean {
  return mode !== "READ_ONLY";
}

export function shouldGrantChatWriteTurn(capability: TrustedExecutionCapability): boolean {
  return allowsDiskWrites(capability.mainResolved) && allowsDiskWrites(capability.effective);
}

/** Accept of staged proposals is allowed for propose + write-capable effective modes. */
export function shouldAllowChatApplyAccept(
  capability: Pick<TrustedExecutionCapability, "effective">
): boolean {
  return capability.effective === "PROPOSE_EDIT" || allowsDiskWrites(capability.effective);
}
