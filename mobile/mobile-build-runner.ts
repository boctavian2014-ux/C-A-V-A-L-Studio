import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { pipelineEventBus } from "../ai/pipeline/pipeline-event-bus";
import { oneShotShellInvocation } from "../src/main/powershell-shell";
import { sanitizeEnvForTerminal } from "../src/main/subprocess-env";
import { redactSensitiveCommandOutput } from "../src/shared/command-output-redaction";
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

const STEP_TIMEOUT_MS = 600_000;
const MAX_OUTPUT_CHARS = 12_000;

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
    // Commands built exclusively in main service — not from renderer
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
        const redacted = redactSensitiveCommandOutput(line);
        logs.push(redacted);
        mobileBuildStore.pushLog(redacted);
        callbacks.onData(redacted);

        const url = this.service.extractBuildUrl(redacted);
        if (url) {
          mobileBuildStore.setBuildUrl(url);
        }

        const detected = this.agent.detectError(redacted);
        if (detected?.matched) {
          void this.agent.analyzeWithAI(logs, redacted).then((analysis) => {
            mobileBuildStore.setError(redacted, analysis);
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
          output: { stepId: entry.stepId, timedOut: result.timedOut },
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
      const redacted = redactSensitiveCommandOutput(line);
      mobileBuildStore.pushLog(redacted);
      callbacks.onData(redacted);
    });
    callbacks.onComplete(!result.failed);
    return { ok: !result.failed, timedOut: result.timedOut } as { ok: boolean };
  }

  private runCommand(
    command: string,
    workspaceRoot: string,
    onLine: (line: string) => void
  ): Promise<{ failed: boolean; code: number | null; timedOut?: boolean }> {
    return new Promise((resolve) => {
      const { file: shell, args: shellArgs } = oneShotShellInvocation(command);

      this.process = spawn(shell, shellArgs, {
        cwd: workspaceRoot,
        env: sanitizeEnvForTerminal(),
        shell: false,
        windowsHide: true,
      });

      let failed = false;
      let timedOut = false;
      let outputChars = 0;

      const timer = setTimeout(() => {
        timedOut = true;
        failed = true;
        if (this.process && !this.process.killed) this.process.kill();
      }, STEP_TIMEOUT_MS);

      const handleChunk = (chunk: Buffer | string) => {
        const text = chunk.toString();
        for (const line of text.split(/\r?\n/)) {
          if (!line.trim()) continue;
          outputChars += line.length;
          if (outputChars > MAX_OUTPUT_CHARS) {
            onLine("… (output truncated)");
            return;
          }
          onLine(line);
        }
      };

      this.process.stdout.on("data", handleChunk);
      this.process.stderr.on("data", (chunk) => {
        failed = true;
        handleChunk(chunk);
      });

      this.process.on("error", (error) => {
        clearTimeout(timer);
        failed = true;
        onLine(`Process error: ${redactSensitiveCommandOutput(error.message)}`);
        this.process = null;
        resolve({ failed: true, code: null, timedOut });
      });

      this.process.on("close", (code) => {
        clearTimeout(timer);
        this.process = null;
        if (code !== 0) failed = true;
        resolve({ failed, code, timedOut });
      });
    });
  }
}

export const mobileBuildRunner = new MobileBuildRunner();
