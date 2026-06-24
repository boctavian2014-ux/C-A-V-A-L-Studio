import { pipelineEventBus } from "./pipeline-event-bus";

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
}

const ALLOWED_TOOLS = new Set(["expo.build", "eas.build", "expo.doctor", "npm.script"]);

const TOOL_COMMANDS: Record<string, (input?: unknown) => string[]> = {
  "expo.doctor": () => ["npx", "expo", "doctor"],
  "expo.build": (input) => {
    const platform = typeof input === "object" && input && "platform" in input
      ? String((input as { platform: string }).platform)
      : "android";
    return ["npx", "eas", "build", "--platform", platform, "--non-interactive"];
  },
  "eas.build": (input) => {
    const platform = typeof input === "object" && input && "platform" in input
      ? String((input as { platform: string }).platform)
      : "android";
    return ["npx", "eas", "build", "--platform", platform, "--non-interactive"];
  },
  "npm.script": (input) => {
    const script = typeof input === "object" && input && "script" in input
      ? String((input as { script: string }).script)
      : "build";
    return ["npm", "run", script];
  }
};

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

    const args = commandBuilder(request.input);
    const blocked = args.join(" ").match(/[;&|`$()]/);
    if (blocked) {
      return { ok: false, error: "Blocked shell metacharacters in tool command." };
    }

    try {
      const { spawn } = await import("node:child_process");
      const output = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(args[0], args.slice(1), { cwd: workspaceRoot, shell: false });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, stdout, stderr }));
      });

      const ok = output.code === 0;
      const result: ToolReplayResult = {
        ok,
        output: { stdout: output.stdout, stderr: output.stderr, code: output.code },
        error: ok ? undefined : output.stderr || `Exit code ${output.code ?? "unknown"}`
      };

      pipelineEventBus.emit({
        type: "tool.result",
        id: request.toolCallId,
        success: ok,
        output: result.output,
        timestamp: Date.now(),
        meta: { replay: true, tool: request.tool }
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pipelineEventBus.emit({
        type: "tool.result",
        id: request.toolCallId,
        success: false,
        output: { error: message },
        timestamp: Date.now(),
        meta: { replay: true, tool: request.tool }
      });
      return { ok: false, error: message };
    }
  }
}

export const toolSandbox = new ToolSandbox();
