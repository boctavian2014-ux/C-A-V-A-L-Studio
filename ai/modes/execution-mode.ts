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
  /(?:^|[\s"'„”])(?:explic[ăa]|explain|ce\s+face|ce\s+rol|rolul\s+(?:fi[șs]ierului|lui)|what\s+(?:does|is)|how\s+does|analizeaz[ăa]|analyze|analys[e]?|inspect|cite[șs]te|read(?:\s+the)?|arat[ăa]-mi|show\s+me|spune-mi|tell\s+me|întrebare|descrie|describe|unde\s+(?:ai\s+)?r[ăa]mas|where\s+(?:you\s+|we\s+)?left\s+off|verific[ăa]\s+folderul|check\s+the\s+folder)/i;

const APPLY_RE =
  /(?:^|[\s"'„”])(?:aplic[ăa](?:\s+(?:schimbarea|modificarea|diff(?:-ul)?|schimb[ăa]rile))?|accept(?:\s+(?:the\s+)?(?:change|diff|write))?|apply(?:\s+the\s+)?(?:change|diff)?)/i;

/** Explicit create/edit intent — no \b (Romanian diacritics break JS word boundaries). */
const CREATE_RE =
  /(?:^|[\s"'„”])(?:te\s+rog\s+(?:s[ăa]\s+)?)?(?:[îi]mi\s+)?(?:creeaz|genereaz|implementeaz|construie[șs]t|create|scaffold|from\s+scratch|proiect\s+nou|app\s+complet|full\s+app|landing|toate\s+fi[șs]ierele|build(?:\s+(?:me\s+)?(?:a|an|the|app|full))?|make\s+(?:me\s+)?(?:a|an|the)\b|adaug[ăa]\s+(?:un|o|fi[șs]ier))/i;

export function allowsDiskWrites(mode: ExecutionMode): boolean {
  return mode === "APPLY_EDIT" || mode === "AGENTIC_REPAIR" || mode === "SCAFFOLD";
}

export function looksLikeExplicitCreate(message: string): boolean {
  return CREATE_RE.test(message.trim());
}

/**
 * Main-owned intent from the original user message. Do not pass UI agent mode —
 * it is not a write-capability signal.
 */
export function resolveExecutionMode(message: string): ExecutionMode {
  const text = message.trim();
  if (!text) return "READ_ONLY";

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
  if (READ_ONLY_RE.test(text)) return "READ_ONLY";
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
}): TrustedExecutionCapability {
  const mainResolved = resolveExecutionMode(input.userMessage);
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
