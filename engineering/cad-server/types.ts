export type CadJobStatus = "queued" | "generating" | "rendering" | "done" | "failed";

export type CadQuality = "standard" | "high";

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

/** Optional engineering plan excerpt passed to the LLM (not persisted). */
export interface CadPlanContext {
  requirements?: string;
  assembly?: string;
  components?: string;
  performance?: string;
}

export type CadGenerationMode = "openscad" | "mesh";

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
  /** Per-request OpenRouter key from Electron (not stored in DB). */
  openRouterApiKey?: string;
  /** Per-request Meshy key from Electron (not stored in DB). */
  meshApiKey?: string;
  quality?: CadQuality;
  conversationHistory?: CadChatMessage[];
  previousScad?: string;
  generationMode?: CadGenerationMode;
  meshPrompt?: string;
  previousMeshTaskId?: string;
}

export interface CadJobRecord {
  id: string;
  cavalId: string | null;
  prompt: string;
  projectType: string | null;
  constraints: CadConstraints;
  generatedScad: string | null;
  status: CadJobStatus;
  errorMessage: string | null;
  stlPath: string | null;
  stlUrl: string | null;
  createdAt: string;
  updatedAt: string;
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
}
