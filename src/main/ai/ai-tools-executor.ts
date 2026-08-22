import type { AiToolCall, AiToolName, AiToolResult } from "../../shared/ai-tools-contract";
import { isAiToolName } from "../../shared/ai-tools-contract";
import type { AiRedactionLevel } from "../../shared/ai-settings-contract";
import { redactSensitiveCommandOutput } from "../../shared/command-output-redaction";
import { isPreviewTarget, type PreviewState, type PreviewTarget } from "../../shared/preview-contract";
import type { Problem } from "../../shared/problems-contract";
import { isValidTaskName } from "../../shared/tasks-contract";
import { gitService } from "../git/git-service";
import { previewLauncher } from "../preview/preview-launcher";
import { problemsService } from "../problems/problems-service";
import { tasksService } from "../tasks/tasks-service";
import { loadAiSettingsSync } from "./ai-settings";

export interface AiToolsExecutorDeps {
  getProblems: (file?: string) => Problem[];
  gitStatus: (workspaceRoot: string) => Promise<unknown>;
  listTasks: (workspaceRoot: string) => Array<{ name: string }>;
  runTask: (workspaceRoot: string, taskName: string) => Promise<{ status: string; id?: string }>;
  startPreview: (target: PreviewTarget, workspaceRoot: string) => Promise<PreviewState>;
  /** Test override — skip disk settings read. */
  isToolEnabled?: (tool: AiToolName) => boolean;
  redactionLevel?: AiRedactionLevel;
}

const defaultDeps: AiToolsExecutorDeps = {
  getProblems: (file) => problemsService.getProblems(file),
  gitStatus: (root) => gitService.status(root),
  listTasks: (root) => tasksService.list(root),
  runTask: (root, name) => tasksService.run(root, name),
  startPreview: (target, root) => previewLauncher.start(target, root),
};

function fail(id: string, error: string): AiToolResult {
  return { id, success: false, output: "", error };
}

function ok(id: string, output: string, level: AiRedactionLevel): AiToolResult {
  return {
    id,
    success: true,
    output: redactSensitiveCommandOutput(output, level),
  };
}

function requireWorkspaceRoot(workspaceRoot: string): string | null {
  const root = workspaceRoot.trim();
  return root.length > 0 ? root : null;
}

function resolveToolGate(
  root: string,
  tool: AiToolName,
  deps: AiToolsExecutorDeps
): { enabled: boolean; redactionLevel: AiRedactionLevel } {
  if (deps.isToolEnabled) {
    return {
      enabled: deps.isToolEnabled(tool),
      redactionLevel: deps.redactionLevel ?? "standard",
    };
  }
  const settings = loadAiSettingsSync(root);
  return {
    enabled: settings.toolsEnabled[tool] !== false,
    redactionLevel: deps.redactionLevel ?? settings.redactionLevel,
  };
}

async function executeGetProblems(
  call: AiToolCall,
  _workspaceRoot: string,
  deps: AiToolsExecutorDeps,
  redactionLevel: AiRedactionLevel
): Promise<AiToolResult> {
  try {
    const problems = deps.getProblems().slice(0, 25);
    return ok(call.id, JSON.stringify(problems, null, 2), redactionLevel);
  } catch (error) {
    return fail(call.id, error instanceof Error ? error.message : String(error));
  }
}

async function executeGitStatus(
  call: AiToolCall,
  workspaceRoot: string,
  deps: AiToolsExecutorDeps,
  redactionLevel: AiRedactionLevel
): Promise<AiToolResult> {
  try {
    const status = await deps.gitStatus(workspaceRoot);
    return ok(call.id, JSON.stringify(status, null, 2), redactionLevel);
  } catch (error) {
    return fail(call.id, error instanceof Error ? error.message : String(error));
  }
}

async function executeRunTask(
  call: AiToolCall,
  workspaceRoot: string,
  deps: AiToolsExecutorDeps,
  redactionLevel: AiRedactionLevel
): Promise<AiToolResult> {
  const taskName = call.args.taskName;
  if (!isValidTaskName(taskName)) {
    return fail(call.id, "Invalid taskName");
  }

  const tasks = deps.listTasks(workspaceRoot);
  if (!tasks.some((t) => t.name === taskName)) {
    return fail(call.id, `Task not found: ${taskName}`);
  }

  try {
    const run = await deps.runTask(workspaceRoot, taskName);
    const success = run.status === "success";
    const body = redactSensitiveCommandOutput(
      `Task ${taskName}: ${run.status}`,
      redactionLevel
    );
    return {
      id: call.id,
      success,
      output: body,
      ...(success ? {} : { error: `Task ${taskName} ended with status ${run.status}` }),
    };
  } catch (error) {
    return fail(call.id, error instanceof Error ? error.message : String(error));
  }
}

async function executeOpenPreview(
  call: AiToolCall,
  workspaceRoot: string,
  deps: AiToolsExecutorDeps,
  redactionLevel: AiRedactionLevel
): Promise<AiToolResult> {
  if (!isPreviewTarget(call.args.target)) {
    return fail(call.id, "Invalid target (expected web or mobile)");
  }
  const target = call.args.target;

  try {
    const state = await deps.startPreview(target, workspaceRoot);
    if (state.status === "not-configured" || state.status === "failed") {
      return fail(
        call.id,
        state.lastError ?? `Preview ${target} could not start (${state.status})`
      );
    }
    return ok(
      call.id,
      `Preview ${target} ${state.status}${state.url ? ` url=${state.url}` : ""}`,
      redactionLevel
    );
  } catch (error) {
    return fail(call.id, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Execute a safe IDE tool against the bound workspace root.
 * Never trusts cwd / paths from the model — only `workspaceRoot` from the caller.
 * Pas 7e.3 — disabled tools return an explicit error (not silent).
 */
export async function executeAiTool(
  call: AiToolCall,
  workspaceRoot: string,
  deps: Partial<AiToolsExecutorDeps> = {}
): Promise<AiToolResult> {
  if (!isAiToolName(call.name)) {
    return fail(call.id, `Unknown tool: ${String(call.name)}`);
  }
  if (typeof call.id !== "string" || !call.id.trim()) {
    return fail("invalid", "Invalid tool call id");
  }
  if (!call.args || typeof call.args !== "object" || Array.isArray(call.args)) {
    return fail(call.id, "Invalid args");
  }

  const root = requireWorkspaceRoot(workspaceRoot);
  if (!root) {
    return fail(call.id, "No bound workspace");
  }

  const resolved: AiToolsExecutorDeps = { ...defaultDeps, ...deps };
  const gate = resolveToolGate(root, call.name as AiToolName, resolved);
  if (!gate.enabled) {
    return fail(call.id, `Tool ${call.name} is disabled in settings`);
  }

  switch (call.name as AiToolName) {
    case "get_problems":
      return executeGetProblems(call, root, resolved, gate.redactionLevel);
    case "git_status":
      return executeGitStatus(call, root, resolved, gate.redactionLevel);
    case "run_task":
      return executeRunTask(call, root, resolved, gate.redactionLevel);
    case "open_preview":
      return executeOpenPreview(call, root, resolved, gate.redactionLevel);
    default:
      return fail(call.id, `Unknown tool: ${call.name}`);
  }
}
