import { spawn } from "node:child_process";

import { pipelineEventBus } from "./pipeline-event-bus";
import { sanitizeEnvForTerminal } from "../../src/main/subprocess-env";
import { redactSensitiveCommandOutput } from "../../src/shared/command-output-redaction";
import { workspaceCommandMutex } from "../tools/workspace-execute-lock";

export interface ToolReplayRequest {
  toolCallId: string;
  tool: string;
  input?: unknown;
  confirm?: boolean;
}

export interface ToolReplayResult {
  ok: boolean;
  output?: unknown;
  error?: string;
  timedOut?: boolean;
}

const ALLOWED_TOOLS = new Set(["expo.build", "eas.build", "expo.doctor", "npm.script"]);
const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_OUTPUT_CHARS = 12_000;

const SAFE_SCRIPT = /^[\w:-]+$/;

const TOOL_COMMANDS: Record<string, (input?: unknown) => string[]> = {
  "expo.doctor": () => ["npx", "expo", "doctor"],
  "expo.build": (input) => {
    const platform =
      typeof input === "object" && input && "platform" in input
        ? String((input as { platform: string }).platform)
        : "android";
    if (!/^(android|ios|all)$/i.test(platform)) {
      throw new Error("Invalid platform for expo.build");
    }
    return ["npx", "eas", "build", "--platform", platform, "--non-interactive"];
  },
  "eas.build": (input) => {
    const platform =
      typeof input === "object" && input && "platform" in input
        ? String((input as { platform: string }).platform)
        : "android";
    if (!/^(android|ios|all)$/i.test(platform)) {
      throw new Error("Invalid platform for eas.build");
    }
    return ["npx", "eas", "build", "--platform", platform, "--non-interactive"];
  },
  "npm.script": (input) => {
    const script =
      typeof input === "object" && input && "script" in input
        ? String((input as { script: string }).script)
        : "build";
    if (!SAFE_SCRIPT.test(script)) {
      throw new Error("Invalid npm script name");
    }
    return ["npm", "run", script];
  },
};

function trimCap(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n… (output truncated)`;
}

export class ToolSandbox {
  async run(request: ToolReplayRequest, workspaceRoot: string): Promise<ToolReplayResult> {
    if (!request.confirm) {
      return { ok: false, error: "Tool replay requires user confirmation." };
    }
    if (!ALLOWED_TOOLS.has(request.tool)) {
      return { ok: false, error: `Tool not allowed: ${request.tool}` };
    }

    const commandBuilder = TOOL_COMMANDS[request.tool];
    if (!commandBuilder) {
      return { ok: false, error: `No command mapping for tool: ${request.tool}` };
    }

    let args: string[];
    try {
      args = commandBuilder(request.input);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    const blocked = args.join(" ").match(/[;&|`$()]/);
    if (blocked) {
      return { ok: false, error: "Blocked shell metacharacters in tool command." };
    }

    try {
      return await workspaceCommandMutex.runExclusive(workspaceRoot, async () => {
        const output = await new Promise<{
          code: number | null;
          stdout: string;
          stderr: string;
          timedOut: boolean;
        }>((resolve, reject) => {
          const child = spawn(args[0], args.slice(1), {
            cwd: workspaceRoot,
            shell: false,
            env: sanitizeEnvForTerminal(),
            windowsHide: true,
          });
          let stdout = "";
          let stderr = "";
          let timedOut = false;
          const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
          }, DEFAULT_TIMEOUT_MS);

          child.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
          });
          child.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
          });
          child.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
          });
          child.on("close", (code) => {
            clearTimeout(timer);
            resolve({
              code,
              stdout: redactSensitiveCommandOutput(trimCap(stdout)),
              stderr: redactSensitiveCommandOutput(trimCap(stderr)),
              timedOut,
            });
          });
        });

        const ok = output.code === 0 && !output.timedOut;
        const result: ToolReplayResult = {
          ok,
          timedOut: output.timedOut,
          output: { stdout: output.stdout, stderr: output.stderr, code: output.code },
          error: ok
            ? undefined
            : output.timedOut
              ? `Timed out after ${DEFAULT_TIMEOUT_MS}ms`
              : output.stderr || `Exit code ${output.code ?? "unknown"}`,
        };

        pipelineEventBus.emit({
          type: "tool.result",
          id: request.toolCallId,
          success: ok,
          output: result.output,
          timestamp: Date.now(),
          meta: { replay: true, tool: request.tool },
        });

        return result;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pipelineEventBus.emit({
        type: "tool.result",
        id: request.toolCallId,
        success: false,
        output: { error: message },
        timestamp: Date.now(),
        meta: { replay: true, tool: request.tool },
      });
      return { ok: false, error: redactSensitiveCommandOutput(message) };
    }
  }
}

export const toolSandbox = new ToolSandbox();
