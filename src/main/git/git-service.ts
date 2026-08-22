import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";

import { redactSensitiveCommandOutput } from "../../shared/command-output-redaction";
import type {
  GitBranch,
  GitCommitInput,
  GitCommitResult,
  GitDiffResult,
  GitFileChange,
  GitFileStatus,
  GitLogEntry,
  GitOperationState,
  GitStatus,
} from "../../shared/git-contract";
import { isGitRelPath } from "../../shared/git-contract";
import { isValidBranchName } from "../../shared/git-security";
import { resolveSandboxedWorkspacePath } from "../path-security";
import { sanitizeEnvForTerminal } from "../subprocess-env";

export interface GitCommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

export type GitRunner = (args: string[], cwd: string) => Promise<GitCommandResult>;

export interface GitStatusSnapshot extends GitStatus {
  isRepo: boolean;
  upstream: string | null;
}

export interface GitServiceOptions {
  runGit?: GitRunner;
}

const MAX_LOG = 1000;
const MAX_FILES = 200;

const STATUS_CODE_MAP: Record<string, GitFileStatus> = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
  C: "copied",
  "?": "untracked",
  "!": "ignored",
  U: "conflicted",
};

export function parsePorcelainStatus(raw: string): GitFileChange[] {
  const files: GitFileChange[] = [];
  const lines = raw.split("\n").filter((line) => line.length > 0);

  for (const line of lines) {
    const stagedCode = line[0] ?? " ";
    const unstagedCode = line[1] ?? " ";
    const rest = line.slice(3);

    let filePath = rest;
    let originalPath: string | undefined;
    if (rest.includes(" -> ")) {
      const [from, to] = rest.split(" -> ");
      originalPath = from;
      filePath = to ?? rest;
    }

    if (stagedCode !== " " && stagedCode !== "?") {
      files.push({
        path: filePath,
        status: STATUS_CODE_MAP[stagedCode] ?? "modified",
        staged: true,
        originalPath,
      });
    }
    if (unstagedCode !== " ") {
      files.push({
        path: filePath,
        status: STATUS_CODE_MAP[unstagedCode] ?? "modified",
        staged: false,
        originalPath,
      });
    }
  }

  return files;
}

export function toWorkspaceGitPath(root: string, filePath: string): string {
  if (!isGitRelPath(filePath)) {
    throw new Error("Invalid file path");
  }
  const abs = resolveSandboxedWorkspacePath(root, filePath.trim());
  const rel = path.relative(root, abs).replace(/\\/g, "/");
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path outside workspace");
  }
  if (rel.startsWith("-")) {
    throw new Error("Invalid file path");
  }
  return rel;
}

export function assertBranchName(name: string): string {
  const trimmed = String(name ?? "").trim();
  if (!isValidBranchName(trimmed)) {
    throw new Error("Invalid branch name");
  }
  return trimmed;
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return redactSensitiveCommandOutput(err.message);
  return redactSensitiveCommandOutput(String(err));
}

function runGitSpawn(args: string[], cwd: string): Promise<GitCommandResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn("git", args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: sanitizeEnvForTerminal(),
    });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      rejectPromise(err);
    });
    proc.on("close", (code) => {
      resolvePromise({
        stdout: redactSensitiveCommandOutput(stdout),
        stderr: redactSensitiveCommandOutput(stderr),
        code: code ?? -1,
      });
    });
  });
}

export class GitService extends EventEmitter {
  private readonly run: GitRunner;
  private operationState: GitOperationState | null = null;

  constructor(options: GitServiceOptions = {}) {
    super();
    this.run = options.runGit ?? runGitSpawn;
  }

  private emitOperation(
    operation: GitOperationState["operation"],
    status: GitOperationState["status"],
    error: string | null = null
  ): void {
    this.operationState = { operation, status, error, timestamp: Date.now() };
    this.emit("operation-changed", this.operationState);
  }

  private async emitStatusChanged(cwd: string): Promise<void> {
    try {
      const status = await this.status(cwd);
      this.emit("status-changed", status);
    } catch {
      // best-effort broadcast; don't throw from here
    }
  }

  private async runChecked(args: string[], cwd: string): Promise<GitCommandResult> {
    const result = await this.run(args, cwd);
    if (result.code !== 0) {
      throw new Error(result.stderr || `git ${args[0] ?? "command"} failed`);
    }
    return result;
  }

  async status(cwd: string): Promise<GitStatusSnapshot> {
    const branchResult = await this.run(["branch", "--show-current"], cwd);
    if (branchResult.code !== 0) {
      return {
        branch: "",
        ahead: 0,
        behind: 0,
        files: [],
        hasConflicts: false,
        isClean: true,
        isRepo: false,
        upstream: null,
      };
    }

    const branch = branchResult.stdout.trim() || "HEAD";
    const statusResult = await this.run(["status", "--porcelain=v1", "--branch"], cwd);
    const files = parsePorcelainStatus(
      statusResult.stdout
        .split("\n")
        .filter((line) => !line.startsWith("##"))
        .join("\n")
    );

    const branchLine = statusResult.stdout.split("\n").find((line) => line.startsWith("##")) ?? "";
    const aheadMatch = branchLine.match(/ahead (\d+)/);
    const behindMatch = branchLine.match(/behind (\d+)/);
    const upstreamMatch = branchLine.match(/^## [^\s.]+(\.\.\.(\S+))?/);
    const hasConflicts = files.some((file) => file.status === "conflicted");

    return {
      branch,
      ahead: aheadMatch?.[1] ? parseInt(aheadMatch[1], 10) : 0,
      behind: behindMatch?.[1] ? parseInt(behindMatch[1], 10) : 0,
      files,
      hasConflicts,
      isClean: files.length === 0,
      isRepo: true,
      upstream: upstreamMatch?.[2] ?? null,
    };
  }

  async stage(cwd: string, files: string[]): Promise<void> {
    this.emitOperation("stage", "running");
    try {
      const rels = this.normalizeFiles(cwd, files);
      await this.runChecked(["add", "--", ...rels], cwd);
      this.emitOperation("stage", "success");
    } catch (err) {
      this.emitOperation("stage", "failed", err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      await this.emitStatusChanged(cwd);
    }
  }

  async unstage(cwd: string, files: string[]): Promise<void> {
    this.emitOperation("unstage", "running");
    try {
      const rels = this.normalizeFiles(cwd, files);
      try {
        await this.runChecked(["restore", "--staged", "--", ...rels], cwd);
      } catch {
        await this.runChecked(["reset", "HEAD", "--", ...rels], cwd);
      }
      this.emitOperation("unstage", "success");
    } catch (err) {
      this.emitOperation("unstage", "failed", err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      await this.emitStatusChanged(cwd);
    }
  }

  async discardChanges(cwd: string, files: string[]): Promise<void> {
    this.emitOperation("checkout", "running");
    try {
      const rels = this.normalizeFiles(cwd, files);
      await this.runChecked(["checkout", "--", ...rels], cwd);
      this.emitOperation("checkout", "success");
    } catch (err) {
      this.emitOperation("checkout", "failed", err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      await this.emitStatusChanged(cwd);
    }
  }

  async commit(cwd: string, input: GitCommitInput): Promise<GitCommitResult> {
    this.emitOperation("commit", "running");
    try {
      if (input.files && input.files.length > 0) {
        const rels = this.normalizeFiles(cwd, input.files);
        await this.runChecked(["add", "--", ...rels], cwd);
      }
      const result = await this.run(["commit", "-m", input.message], cwd);
      if (result.code !== 0) {
        throw new Error(result.stderr || "Commit failed");
      }
      const hashResult = await this.run(["rev-parse", "HEAD"], cwd);
      const hash = hashResult.stdout.trim();
      this.emitOperation("commit", "success");
      return { hash, message: input.message };
    } catch (err) {
      this.emitOperation("commit", "failed", err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      await this.emitStatusChanged(cwd);
    }
  }

  async branches(cwd: string): Promise<GitBranch[]> {
    const result = await this.run(["branch", "-vv"], cwd);
    if (result.code !== 0) return [];
    const lines = result.stdout.split("\n").filter((line) => line.trim().length > 0);

    return lines.map((line) => {
      const current = line.startsWith("*");
      const cleaned = line.replace(/^\*?\s+/, "");
      const nameMatch = cleaned.match(/^(\S+)/);
      const name = nameMatch?.[1] ?? cleaned;
      const remoteMatch = cleaned.match(/\[([^\]:]+)/);
      const aheadMatch = cleaned.match(/ahead (\d+)/);
      const behindMatch = cleaned.match(/behind (\d+)/);

      return {
        name,
        current,
        remote: remoteMatch?.[1] ?? null,
        ahead: aheadMatch?.[1] ? parseInt(aheadMatch[1], 10) : 0,
        behind: behindMatch?.[1] ? parseInt(behindMatch[1], 10) : 0,
      };
    });
  }

  async checkout(cwd: string, branch: string): Promise<void> {
    this.emitOperation("checkout", "running");
    try {
      const name = assertBranchName(branch);
      const result = await this.run(["checkout", name], cwd);
      if (result.code !== 0) {
        throw new Error(result.stderr || "Checkout failed");
      }
      this.emitOperation("checkout", "success");
    } catch (err) {
      this.emitOperation("checkout", "failed", err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      await this.emitStatusChanged(cwd);
    }
  }

  async createBranch(cwd: string, name: string, from?: string): Promise<void> {
    this.emitOperation("checkout", "running");
    try {
      const branch = assertBranchName(name);
      const startPoint = from === undefined ? undefined : assertBranchName(from);
      const args = startPoint
        ? ["checkout", "-b", branch, startPoint]
        : ["checkout", "-b", branch];
      const result = await this.run(args, cwd);
      if (result.code !== 0) {
        throw new Error(result.stderr || "Create branch failed");
      }
      this.emitOperation("checkout", "success");
    } catch (err) {
      this.emitOperation("checkout", "failed", err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      await this.emitStatusChanged(cwd);
    }
  }

  async diff(cwd: string, file?: string, staged?: boolean): Promise<GitDiffResult> {
    const args = ["diff"];
    if (staged) args.push("--cached");
    if (file) args.push("--", toWorkspaceGitPath(cwd, file));

    const result = await this.run(args, cwd);
    const binary = result.stdout.includes("Binary files");

    return {
      path: file ?? "",
      diff: result.stdout,
      binary,
    };
  }

  async log(cwd: string, limit = 50): Promise<GitLogEntry[]> {
    const n = Math.min(Math.max(Number(limit) || 50, 1), MAX_LOG);
    const format = "%H%x00%h%x00%s%x00%an%x00%ae%x00%aI";
    const result = await this.run(["log", `-${n}`, `--pretty=format:${format}`], cwd);

    if (!result.stdout.trim()) return [];

    return result.stdout.split("\n").map((line) => {
      const [hash, shortHash, message, author, email, date] = line.split("\x00");
      return {
        hash: hash ?? "",
        shortHash: shortHash ?? "",
        message: message ?? "",
        author: author ?? "",
        email: email ?? "",
        date: date ?? "",
      };
    });
  }

  async stageAll(cwd: string): Promise<void> {
    this.emitOperation("stage", "running");
    try {
      await this.runChecked(["add", "-A"], cwd);
      this.emitOperation("stage", "success");
    } catch (err) {
      this.emitOperation("stage", "failed", err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      await this.emitStatusChanged(cwd);
    }
  }

  async unstageAll(cwd: string): Promise<void> {
    this.emitOperation("unstage", "running");
    try {
      await this.run(["reset", "HEAD"], cwd);
      this.emitOperation("unstage", "success");
    } catch (err) {
      this.emitOperation("unstage", "failed", err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      await this.emitStatusChanged(cwd);
    }
  }

  async discard(cwd: string, filePath: string): Promise<void> {
    const rel = toWorkspaceGitPath(cwd, filePath);
    await this.discardChanges(cwd, [rel]);
  }

  async init(cwd: string): Promise<void> {
    this.emitOperation("init", "running");
    try {
      await this.runChecked(["init"], cwd);
      this.emitOperation("init", "success");
    } catch (err) {
      this.emitOperation("init", "failed", err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      await this.emitStatusChanged(cwd);
    }
  }

  async stash(cwd: string, message?: string): Promise<void> {
    this.emitOperation("stash", "running");
    try {
      const args =
        message && message.trim() ? (["stash", "push", "-m", message.trim()] as string[]) : ["stash"];
      await this.runChecked(args, cwd);
      this.emitOperation("stash", "success");
    } catch (err) {
      this.emitOperation("stash", "failed", err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      await this.emitStatusChanged(cwd);
    }
  }

  async stashPop(cwd: string): Promise<void> {
    this.emitOperation("stash", "running");
    try {
      await this.runChecked(["stash", "pop"], cwd);
      this.emitOperation("stash", "success");
    } catch (err) {
      this.emitOperation("stash", "failed", err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      await this.emitStatusChanged(cwd);
    }
  }

  async push(cwd: string, setUpstream?: boolean): Promise<void> {
    this.emitOperation("push", "running");
    try {
      const args = setUpstream ? ["push", "--set-upstream", "origin", "HEAD"] : ["push"];
      await this.runChecked(args, cwd);
      this.emitOperation("push", "success");
    } catch (err) {
      this.emitOperation("push", "failed", err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      await this.emitStatusChanged(cwd);
    }
  }

  async pull(cwd: string, rebase = false): Promise<void> {
    this.emitOperation("pull", "running");
    try {
      const args = rebase ? ["pull", "--rebase"] : ["pull"];
      await this.runChecked(args, cwd);
      this.emitOperation("pull", "success");
    } catch (err) {
      this.emitOperation("pull", "failed", err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      await this.emitStatusChanged(cwd);
    }
  }

  async clone(parentDir: string, cloneUrl: string, targetDir: string): Promise<void> {
    if (!cloneUrl.startsWith("https://github.com/") || cloneUrl.includes("..") || cloneUrl.startsWith("-")) {
      throw new Error("Invalid clone URL");
    }
    this.emitOperation("clone", "running");
    try {
      const hooksPath = process.platform === "win32" ? "NUL" : "/dev/null";
      await this.runChecked(
        ["-c", `core.hooksPath=${hooksPath}`, "clone", "--depth", "1", "--", cloneUrl, targetDir],
        parentDir
      );
      this.emitOperation("clone", "success");
    } catch (err) {
      this.emitOperation("clone", "failed", err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  formatError(err: unknown): string {
    return errMessage(err);
  }

  private normalizeFiles(cwd: string, files: string[]): string[] {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error("No files specified");
    }
    if (files.length > MAX_FILES) {
      throw new Error("Too many files");
    }
    return files.map((file) => toWorkspaceGitPath(cwd, file));
  }
}

export const gitService = new GitService();
