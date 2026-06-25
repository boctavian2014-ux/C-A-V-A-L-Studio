export type CadJobStatus = "queued" | "generating" | "rendering" | "done" | "failed";

export interface CadConstraints {
  budget?: string;
  dimensions?: string;
  voltage?: string;
  autonomy?: string;
  weight?: string;
  skillLevel?: string;
}

export interface CreateCadJobInput {
  prompt: string;
  projectType?: string;
  constraints?: CadConstraints;
  cavalId?: string;
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
}
