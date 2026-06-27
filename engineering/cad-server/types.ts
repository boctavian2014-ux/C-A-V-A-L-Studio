/** Canonical CAD server types — single source of truth for job lifecycle. */

export type CadJobStatus =
  | "queued"
  | "generating"
  | "rendering"
  | "done"
  | "failed"
  | "cancelled";

export type CadQuality = "standard" | "high";

export type CadGenerationMode = "openscad" | "mesh";

export interface CadChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StlDimensions {
  x: number;
  y: number;
  z: number;
}

export interface CadConstraints {
  budget?: string;
  dimensions?: string;
  voltage?: string;
  autonomy?: string;
  weight?: string;
  skillLevel?: string;
}

/** Engineering plan excerpt passed to the LLM (not persisted verbatim). */
export interface CadPlanContext {
  requirements?: string;
  assembly?: string;
  components?: string;
  performance?: string;
}

export interface CadAttachment {
  path: string;
  name: string;
  content: string;
}

export interface PlanPrint3DRequest {
  messages: CadChatMessage[];
  latestUserText: string;
  openRouterApiKey?: string;
  previousMeshTaskId?: string;
}

export interface CreateCadJobInput {
  prompt: string;
  projectType?: string;
  constraints?: CadConstraints;
  cavalId?: string;
  planContext?: CadPlanContext;
  /** Per-request OpenRouter key from Electron (never stored). */
  openRouterApiKey?: string;
  /** Per-request Meshy key from Electron (never stored). */
  meshApiKey?: string;
  quality?: CadQuality;
  conversationHistory?: CadChatMessage[];
  previousScad?: string;
  generationMode?: CadGenerationMode;
  meshPrompt?: string;
  previousMeshTaskId?: string;
  attachments?: CadAttachment[];
}

/** Persisted CAD job record. */
export interface CadJob {
  id: string;
  userId: string | null;
  cavalId: string | null;
  prompt: string;
  projectType: string | null;
  constraints: CadConstraints;
  generationMode: CadGenerationMode;
  generatedScad: string | null;
  status: CadJobStatus;
  errorMessage: string | null;
  stlPath: string | null;
  meshTaskId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

/** @deprecated Use CadJob — kept for internal migration. */
export type CadJobRecord = CadJob;

export interface CadJobResult {
  ok: boolean;
  jobId: string;
  status: CadJobStatus;
  stlSignedUrl: string | null;
  scad: string | null;
  dimensions: StlDimensions | null;
  meshTaskId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CadJobLogLevel = "info" | "warn" | "error";

export interface CadJobLogEntry {
  at: string;
  level: CadJobLogLevel;
  event: string;
  message?: string;
  meta?: Record<string, unknown>;
}

export interface CadJobPublicView {
  ok: boolean;
  jobId?: string;
  status?: CadJobStatus;
  stlUrl?: string | null;
  scad?: string | null;
  error?: string | null;
  dimensions?: StlDimensions | null;
  meshTaskId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CadAuthContext {
  cavalId: string;
  userId: string | null;
  isService: boolean;
}

declare global {
  namespace Express {
    interface Request {
      cadAuth?: CadAuthContext;
    }
  }
}
