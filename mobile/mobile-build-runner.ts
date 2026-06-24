import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { pipelineEventBus } from "../ai/pipeline/pipeline-event-bus";
import { MobileBuildAgent } from "./mobile-build-agent";
import { MobileBuildService } from "./mobile-build-service";
import { mobileBuildStore } from "./mobile-build-store";
import type { MobileBuildErrorAnalysis, MobilePlatform } from "./types";

export interface MobileBuildRunnerCallbacks {
  onData: (line: string) => void;
  onError: (analysis: MobileBuildErrorAnalysis) => void;
  onStep: (stepId: string, status: "running" | "done" | "error") => void;
  onComplete: (ok: boolean) => void;
}

export class MobileBuildRunner {
  private process: ChildProcessWithoutNullStreams | null = null;
  private cancelled = false;

  constructor(
    private readonly service = new MobileBuildService(),
    private readonly agent = new MobileBuildAgent()
  ) {}

  isRunning(): boolean {
    return Boolean(this.process && !this.process.killed);
  }

  cancel(): void {
    this.cancelled = true;
    if (this.process && !this.process.killed) {
      this.process.kill();
    }
    this.process = null;
    mobileBuildStore.setStatus("idle");
  }

  async run(platform: MobilePlatform, workspaceRoot: string, callbacks: MobileBuildRunnerCallbacks): Promise<{ ok: boolean }> {
    this.cancelled = false;
    const commands = this.service.getCommands(platform, workspaceRoot);
    const logs: string[] = [];

    mobileBuildStore.resetForBuild();
    mobileBuildStore.setPlatform(platform);

    for (const entry of commands) {
      if (this.cancelled) {
        callbacks.onComplete(false);
        return { ok: false };
      }

      callbacks.onStep(entry.stepId, "running");
      mobileBuildStore.updateStep(entry.stepId, "running");
      callbacks.onData(`> ${entry.command}`);

      const toolCallId = `mobile-${entry.stepId}-${Date.now()}`;
      pipelineEventBus.emit({
        type: "tool.call",
        id: toolCallId,
        tool: entry.stepId.includes("eas") ? "eas.build" : "expo.build",
        input: { command: entry.command, platform },
        timestamp: Date.now(),
        meta: { stepId: entry.stepId }
      });

      const result = await this.runCommand(entry.command, workspaceRoot, (line) => {
        logs.push(line);
        mobileBuildStore.pushLog(line);
        callbacks.onData(line);

        const url = this.service.extractBuildUrl(line);
        if (url) {
          mobileBuildStore.setBuildUrl(url);
        }

        const detected = this.agent.detectError(line);
        if (detected?.matched) {
          void this.agent.analyzeWithAI(logs, line).then((analysis) => {
            mobileBuildStore.setError(line, analysis);
            callbacks.onError(analysis);
          });
        }
      });

      if (result.failed) {
        callbacks.onStep(entry.stepId, "error");
        mobileBuildStore.updateStep(entry.stepId, "error");
        pipelineEventBus.emit({
          type: "tool.result",
          id: toolCallId,
          success: false,
          output: { stepId: entry.stepId },
          timestamp: Date.now()
        });
        pipelineEventBus.emit({
          type: "error.occurred",
          nodeId: "debug",
          message: `Mobile build step failed: ${entry.stepId}`,
          timestamp: Date.now(),
          meta: { stepId: entry.stepId, command: entry.command }
        });
        callbacks.onComplete(false);
        return { ok: false };
      }

      pipelineEventBus.emit({
        type: "tool.result",
        id: toolCallId,
        success: true,
        output: { stepId: entry.stepId },
        timestamp: Date.now()
      });

      callbacks.onStep(entry.stepId, "done");
      mobileBuildStore.updateStep(entry.stepId, "done");
    }

    mobileBuildStore.markSuccess();
    callbacks.onComplete(true);
    return { ok: true };
  }

  async runFix(command: string, workspaceRoot: string, callbacks: Pick<MobileBuildRunnerCallbacks, "onData" | "onComplete">): Promise<{ ok: boolean }> {
    callbacks.onData(`> ${command}`);
    const result = await this.runCommand(command, workspaceRoot, (line) => {
      mobileBuildStore.pushLog(line);
      callbacks.onData(line);
    });
    callbacks.onComplete(!result.failed);
    return { ok: !result.failed };
  }

  private runCommand(
    command: string,
    workspaceRoot: string,
    onLine: (line: string) => void
  ): Promise<{ failed: boolean; code: number | null }> {
    return new Promise((resolve) => {
      const shell = process.platform === "win32" ? "powershell.exe" : "bash";
      const shellArgs = process.platform === "win32"
        ? ["-NoProfile", "-Command", command]
        : ["-lc", command];

      this.process = spawn(shell, shellArgs, {
        cwd: workspaceRoot,
        env: process.env,
        shell: false
      });

      let failed = false;

      const handleChunk = (chunk: Buffer | string) => {
        const text = chunk.toString();
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) onLine(line);
        }
      };

      this.process.stdout.on("data", handleChunk);
      this.process.stderr.on("data", (chunk) => {
        failed = true;
        handleChunk(chunk);
      });

      this.process.on("error", (error) => {
        failed = true;
        onLine(`Process error: ${error.message}`);
        this.process = null;
        resolve({ failed: true, code: null });
      });

      this.process.on("close", (code) => {
        this.process = null;
        if (code !== 0) failed = true;
        resolve({ failed, code });
      });
    });
  }
}

export const mobileBuildRunner = new MobileBuildRunner();
