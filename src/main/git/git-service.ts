import path from "node:path";

import {
  isGitBranchName,
  isGitRelPath,
  type GitBranch,
  type GitCommitInput,
  type GitFileChange,
  type GitFileStatus,
  type GitLogEntry,
  type GitStatus,
} from "../../shared/git-contract";
import { gitExecFile, isGitRepo, type GitExecResult } from "../git-exec";
import { resolveSandboxedWorkspacePath } from "../path-security";
import { redactSensitiveCommandOutput } from "../../shared/command-output-redaction";

export type GitExecFn = (
  cwd: string,
  args: string[],
  options?: { timeoutMs?: number; maxBuffer?: number; allowNonZero?: boolean }
) => Promise<GitExecResult>;

export interface GitStatusSnapshot extends GitStatus {
  isRepo: boolean;
  upstream: string | null;
}

export interface GitServiceOptions {
  exec?: GitExecFn;
  isRepo?: (cwd: string) => Promise<boolean>;
}

const MAX_LOG = 500;
const MAX_FILES = 200;

function mapPorcelainCode(code: string): GitFileStatus {
  switch (code) {
    case "A":
    case "C":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "?":
      return "untracked";
    case "!":
      return "ignored";
    default:
      return "modified";
  }
}

export function parsePorcelainStatus(raw: string): GitFileChange[] {
  const files: GitFileChange[] = [];
  const lines = raw.split("\n").filter(Boolean);

  for (const line of lines) {
    const xy = line.substring(0, 2);
    const rest = line.substring(3);
    const X = xy[0] ?? " ";
    const Y = xy[1] ?? " ";

    if (X === "R" || Y === "R") {
      const parts = rest.split(" -> ");
      files.push({
        path: parts[1] || rest,
        status: "renamed",
        staged: X === "R",
      });
      continue;
    }

    if (X === "?" && Y === "?") {
      files.push({ path: rest, status: "untracked", staged: false });
      continue;
    }

    if (X !== " " && X !== "?") {
      files.push({ path: rest, status: mapPorcelainCode(X), staged: true });
    }

    if (Y !== " " && Y !== "?") {
      const existing = files.find((file) => file.path === rest && !file.staged);
      if (!existing) {
        files.push({ path: rest, status: mapPorcelainCode(Y), staged: false });
      }
    }
  }

  return files;
}

export function parseGitLog(raw: string): GitLogEntry[] {
  if (!raw.trim()) return [];
  const commits = raw.split("\x00").filter(Boolean);
  return commits.map((block) => {
    const parts = block.split("\x1f");
    return {
      hash: parts[0] || "",
      message: parts[1] || "",
      author: parts[2] || "",
      date: parts[3] || "",
    };
  });
}

export function parseBranchList(raw: string): GitBranch[] {
  return raw
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split("\t");
      const markedCurrent = parts[0] === "*";
      const nameIndex = markedCurrent || parts[0] === "" || parts[0] === " " ? 1 : 0;
      const name = (parts[nameIndex] ?? "").trim();
      const remote = (parts[nameIndex + 1] ?? "").trim() || null;
      return {
        name,
        current: markedCurrent,
        remote,
      };
    })
    .filter((branch) => branch.name.length > 0);
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
  if (!isGitBranchName(trimmed)) {
    throw new Error("Invalid branch name");
  }
  return trimmed;
}

export function assertCommitMessage(message: string): string {
  const trimmed = String(message ?? "").trim();
  if (!trimmed) {
    throw new Error("Mesajul commit-ului este gol.");
  }
  if (trimmed.length > 4000) {
    throw new Error("Commit message too long.");
  }
  return trimmed;
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return redactSensitiveCommandOutput(err.message);
  return redactSensitiveCommandOutput(String(err));
}

export class GitService {
  private readonly exec: GitExecFn;
  private readonly isRepo: (cwd: string) => Promise<boolean>;

  constructor(options: GitServiceOptions = {}) {
    this.exec = options.exec ?? gitExecFile;
    this.isRepo = options.isRepo ?? isGitRepo;
  }

  async status(cwd: string): Promise<GitStatusSnapshot> {
    if (!(await this.isRepo(cwd))) {
      return { branch: "", ahead: 0, behind: 0, files: [], isRepo: false, upstream: null };
    }

    const branchRaw = await this.exec(cwd, ["branch", "--show-current"], { allowNonZero: true });
    const branch = branchRaw.stdout.trim() || "HEAD detached";

    let upstream: string | null = null;
    let ahead = 0;
    let behind = 0;

    try {
      const upstreamRaw = await this.exec(cwd, [
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{u}",
      ]);
      upstream = upstreamRaw.stdout.trim();

      const revListRaw = await this.exec(cwd, ["rev-list", "--count", "--left-right", "@{u}...HEAD"]);
      const [b, a] = revListRaw.stdout.trim().split("\t").map(Number);
      ahead = a || 0;
      behind = b || 0;
    } catch {
      // no upstream
    }

    const statusRaw = await this.exec(cwd, ["status", "--porcelain=v1", "-u"], {
      allowNonZero: true,
    });
    return {
      branch,
      upstream,
      ahead,
      behind,
      files: parsePorcelainStatus(statusRaw.stdout),
      isRepo: true,
    };
  }

  async stage(cwd: string, files: string[]): Promise<void> {
    await this.requireRepo(cwd);
    const rels = this.normalizeFiles(cwd, files);
    await this.exec(cwd, ["add", "--", ...rels]);
  }

  async unstage(cwd: string, files: string[]): Promise<void> {
    await this.requireRepo(cwd);
    const rels = this.normalizeFiles(cwd, files);
    try {
      await this.exec(cwd, ["restore", "--staged", "--", ...rels]);
    } catch {
      await this.exec(cwd, ["reset", "HEAD", "--", ...rels], { allowNonZero: true });
    }
  }

  async commit(cwd: string, input: GitCommitInput): Promise<string | undefined> {
    await this.requireRepo(cwd);
    const message = assertCommitMessage(input.message);
    if (input.files?.length) {
      const rels = this.normalizeFiles(cwd, input.files);
      await this.exec(cwd, ["add", "--", ...rels]);
    }
    const { stdout } = await this.exec(cwd, ["commit", "-m", message]);
    return stdout.match(/\[[\w\s/-]+ ([a-f0-9]+)\]/)?.[1];
  }

  async branches(cwd: string): Promise<GitBranch[]> {
    if (!(await this.isRepo(cwd))) return [];
    const raw = await this.exec(
      cwd,
      ["for-each-ref", "--format=%(HEAD)%09%(refname:short)%09%(upstream:short)", "refs/heads"],
      { allowNonZero: true }
    );
    const branches = parseBranchList(raw.stdout);
    if (branches.some((branch) => branch.current)) return branches;
    const currentRaw = await this.exec(cwd, ["branch", "--show-current"], { allowNonZero: true });
    const current = currentRaw.stdout.trim();
    return branches.map((branch) => ({ ...branch, current: branch.name === current }));
  }

  async checkout(cwd: string, branch: string): Promise<void> {
    await this.requireRepo(cwd);
    const name = assertBranchName(branch);
    await this.exec(cwd, ["checkout", name]);
  }

  async diff(cwd: string, file?: string, staged = false): Promise<string> {
    if (!(await this.isRepo(cwd))) return "";
    const args = staged ? ["diff", "--staged"] : ["diff"];
    if (file) {
      const rel = toWorkspaceGitPath(cwd, file);
      args.push("--", rel);
    }
    const raw = await this.exec(cwd, args, { allowNonZero: true });

    if (!raw.stdout.trim() && !staged && file) {
      try {
        const rel = toWorkspaceGitPath(cwd, file);
        const abs = resolveSandboxedWorkspacePath(cwd, rel);
        const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";
        const untracked = await this.exec(cwd, ["diff", "--no-index", nullDevice, abs], {
          allowNonZero: true,
        });
        return untracked.stdout;
      } catch {
        return "";
      }
    }
    return raw.stdout;
  }

  async log(cwd: string, limit = 50): Promise<GitLogEntry[]> {
    if (!(await this.isRepo(cwd))) return [];
    const n = Math.min(Math.max(Number(limit) || 50, 1), MAX_LOG);
    const format = "%H%x1f%s%x1f%an%x1f%aI%x00";
    const raw = await this.exec(cwd, ["log", `--format=${format}`, "-n", String(n)], {
      allowNonZero: true,
    });
    return parseGitLog(raw.stdout);
  }

  async stageAll(cwd: string): Promise<void> {
    await this.requireRepo(cwd);
    await this.exec(cwd, ["add", "-A"]);
  }

  async unstageAll(cwd: string): Promise<void> {
    await this.requireRepo(cwd);
    await this.exec(cwd, ["reset", "HEAD"], { allowNonZero: true });
  }

  async discard(cwd: string, filePath: string): Promise<void> {
    await this.requireRepo(cwd);
    const rel = toWorkspaceGitPath(cwd, filePath);
    await this.exec(cwd, ["restore", "--", rel]);
  }

  async createBranch(cwd: string, name: string): Promise<void> {
    await this.requireRepo(cwd);
    const branch = assertBranchName(name);
    await this.exec(cwd, ["checkout", "-b", branch]);
  }

  async init(cwd: string): Promise<void> {
    await this.exec(cwd, ["init"]);
  }

  async stash(cwd: string, message?: string): Promise<void> {
    await this.requireRepo(cwd);
    const args =
      message && message.trim() ? (["stash", "push", "-m", message.trim()] as string[]) : ["stash"];
    await this.exec(cwd, args);
  }

  async stashPop(cwd: string): Promise<void> {
    await this.requireRepo(cwd);
    await this.exec(cwd, ["stash", "pop"]);
  }

  async push(cwd: string, setUpstream?: boolean): Promise<void> {
    await this.requireRepo(cwd);
    const args = setUpstream ? ["push", "--set-upstream", "origin", "HEAD"] : ["push"];
    await this.exec(cwd, args, { timeoutMs: 180_000 });
  }

  async pull(cwd: string): Promise<void> {
    await this.requireRepo(cwd);
    await this.exec(cwd, ["pull"], { timeoutMs: 180_000 });
  }

  formatError(err: unknown): string {
    return errMessage(err);
  }

  private async requireRepo(cwd: string): Promise<void> {
    if (!(await this.isRepo(cwd))) {
      throw new Error("Not a git repository");
    }
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
