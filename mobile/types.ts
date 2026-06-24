export type MobilePlatform = "android" | "ios" | "ota";

export type BuildStepStatus = "pending" | "running" | "done" | "error";

export type BuildStatus = "idle" | "running" | "success" | "error";

export interface BuildStep {
  id: string;
  label: string;
  status: BuildStepStatus;
}

export interface MobileBuildState {
  platform: MobilePlatform;
  steps: BuildStep[];
  status: BuildStatus;
  logs: string[];
  showTutorial: boolean;
  lastError?: string;
  buildUrl?: string;
  aiExplanation?: string;
  suggestedCommands: string[];
  canAutoFix: boolean;
}

export interface MobileBuildCommand {
  stepId: string;
  command: string;
  shell: boolean;
}

export interface ExpoProjectInfo {
  isExpo: boolean;
  hasAppConfig: boolean;
  hasEasConfig: boolean;
  configFiles: string[];
}

export interface MobileBuildErrorAnalysis {
  matched: boolean;
  pattern?: string;
  explanation: string;
  suggestedCommands: string[];
  canAutoFix: boolean;
}

export interface MobileBuildStartRequest {
  platform: MobilePlatform;
  workspaceRoot: string;
}

export interface MobileBuildFixRequest {
  command: string;
  workspaceRoot: string;
}
