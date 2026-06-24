import { MobileBuildAgent } from "./mobile-build-agent";
import { MobileBuildService } from "./mobile-build-service";
import { mobileBuildStore } from "./mobile-build-store";
import type { MobileBuildState, MobilePlatform } from "./types";

export class MobileBuildApi {
  constructor(
    private readonly store = mobileBuildStore,
    private readonly service = new MobileBuildService(),
    private readonly agent = new MobileBuildAgent()
  ) {}

  getState() {
    return this.store.current;
  }

  subscribe(listener: (state: MobileBuildState) => void) {
    return this.store.subscribe(listener);
  }

  setPlatform(platform: MobilePlatform) {
    this.store.setPlatform(platform);
  }

  setShowTutorial(show: boolean) {
    this.store.setShowTutorial(show);
  }

  getCommands(platform: MobilePlatform, workspaceRoot: string) {
    return this.service.getCommands(platform, workspaceRoot);
  }

  detectProject(workspaceRoot: string) {
    return this.service.detectExpoProject(workspaceRoot);
  }

  analyzeLine(line: string, logs: string[]) {
    return this.agent.handleBuildOutput(line, logs);
  }

  async analyzeWithAI(logs: string[], errorLine: string) {
    return this.agent.analyzeWithAI(logs, errorLine);
  }

  extractBuildUrl(line: string) {
    return this.service.extractBuildUrl(line);
  }
}

export const mobileBuildApi = new MobileBuildApi();
