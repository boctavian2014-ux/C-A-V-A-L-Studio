import type { BuildStep, BuildStepStatus, BuildStatus, MobileBuildState, MobilePlatform } from "./types";

type MobileBuildListener = (state: MobileBuildState) => void;

const DEFAULT_STEPS: BuildStep[] = [
  { id: "env", label: "Check environment", status: "pending" },
  { id: "login", label: "Login to Expo", status: "pending" },
  { id: "prepare", label: "Prepare project", status: "pending" },
  { id: "build", label: "Build", status: "pending" },
  { id: "upload", label: "Upload", status: "pending" },
  { id: "publish", label: "Publish", status: "pending" }
];

export class MobileBuildStore {
  private state: MobileBuildState = {
    platform: "android",
    steps: DEFAULT_STEPS.map((s) => ({ ...s })),
    status: "idle",
    logs: [],
    showTutorial: false,
    suggestedCommands: [],
    canAutoFix: false
  };

  private readonly listeners = new Set<MobileBuildListener>();

  get current(): MobileBuildState {
    return this.state;
  }

  subscribe(listener: MobileBuildListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  setPlatform(platform: MobilePlatform): void {
    this.state = { ...this.state, platform };
    this.emit();
  }

  setShowTutorial(show: boolean): void {
    this.state = { ...this.state, showTutorial: show };
    this.emit();
  }

  resetForBuild(): void {
    this.state = {
      ...this.state,
      status: "running",
      logs: [],
      lastError: undefined,
      buildUrl: undefined,
      aiExplanation: undefined,
      suggestedCommands: [],
      canAutoFix: false,
      steps: DEFAULT_STEPS.map((s) => ({ ...s, status: "pending" }))
    };
    this.emit();
  }

  setStatus(status: BuildStatus): void {
    this.state = { ...this.state, status };
    this.emit();
  }

  pushLog(line: string): void {
    this.state = { ...this.state, logs: [...this.state.logs, line] };
    this.emit();
  }

  updateStep(stepId: string, status: BuildStepStatus): void {
    this.state = {
      ...this.state,
      steps: this.state.steps.map((step) =>
        step.id === stepId ? { ...step, status } : step
      )
    };
    this.emit();
  }

  setError(error: string, analysis?: { explanation: string; suggestedCommands: string[]; canAutoFix: boolean }): void {
    this.state = {
      ...this.state,
      status: "error",
      lastError: error,
      aiExplanation: analysis?.explanation,
      suggestedCommands: analysis?.suggestedCommands ?? [],
      canAutoFix: analysis?.canAutoFix ?? false
    };
    this.emit();
  }

  setBuildUrl(url: string): void {
    this.state = { ...this.state, buildUrl: url };
    this.emit();
  }

  markSuccess(): void {
    this.state = { ...this.state, status: "success" };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

export const mobileBuildStore = new MobileBuildStore();
