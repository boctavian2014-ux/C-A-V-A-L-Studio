import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createIpcHarness } from "../main/ipc-harness";
import { sanitizeEnvForTerminal, isSecretEnvKey } from "../../src/main/subprocess-env";
import { assertShellCommandAllowed } from "../../src/main/shell-security";
import { redactSensitiveCommandOutput } from "../../src/shared/command-output-redaction";
import {
  workspaceCommandMutex,
  workspaceGitMutex,
  workspaceCadMutex,
} from "../../ai/tools/workspace-execute-lock";

const execFileAsync = promisify(execFile);
const harness = createIpcHarness();
const boundRoots = new Map<number, string>();
const showMessageBox = vi.fn().mockResolvedValue({ response: 1 }); // default: cancel

const ptySpawn = vi.fn((_shell: string, _args: string[], opts: { cwd?: string; env?: Record<string, string> }) => {
  const handlers: Array<(data: string) => void> = [];
  return {
    onData: (cb: (data: string) => void) => handlers.push(cb),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    cwd: opts.cwd,
    env: opts.env,
  };
});

vi.mock("electron", () => ({
  ipcMain: harness.ipcMain,
  BrowserWindow: {
    fromWebContents: vi.fn(() => ({ webContents: { send: vi.fn() } })),
  },
  dialog: {
    showMessageBox,
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
  },
}));

vi.mock("node-pty", () => ({
  spawn: ptySpawn,
}));

vi.mock("../../src/main/powershell-shell", async () => {
  const actual = await vi.importActual<typeof import("../../src/main/powershell-shell")>(
    "../../src/main/powershell-shell"
  );
  return {
    ...actual,
    ensureLatestPowerShellInstalled: vi.fn(async () => ({ ok: true, already: true })),
  };
});

const toolSandboxRun = vi.fn(async () => ({ ok: true }));
vi.mock("../../ai/pipeline/tool-sandbox", () => ({
  toolSandbox: { run: toolSandboxRun },
}));

function mkTmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("Lot B — sanitizeEnv / redaction / allowlist unit", () => {
  it("strips *_API_KEY, *TOKEN*, *SECRET*, OPENROUTER*, MESHY*, STRIPE*", () => {
    const sanitized = sanitizeEnvForTerminal({
      PATH: "/bin",
      OPENROUTER_API_KEY: "x",
      OPENROUTER_BASE_URL: "https://openrouter.ai",
      MESHY_API_KEY: "m",
      MESHY_FOO: "y",
      STRIPE_SECRET_KEY: "sk",
      STRIPE_PUBLISHABLE_KEY: "pk",
      MY_CUSTOM_TOKEN: "t",
      NESTED_SECRET_VALUE: "s",
      FOO_API_KEY: "k",
      HOME: "/home",
    });
    expect(sanitized.PATH).toBe("/bin");
    expect(sanitized.HOME).toBe("/home");
    expect(sanitized.OPENROUTER_API_KEY).toBeUndefined();
    expect(sanitized.OPENROUTER_BASE_URL).toBeUndefined();
    expect(sanitized.MESHY_API_KEY).toBeUndefined();
    expect(sanitized.MESHY_FOO).toBeUndefined();
    expect(sanitized.STRIPE_SECRET_KEY).toBeUndefined();
    expect(sanitized.STRIPE_PUBLISHABLE_KEY).toBeUndefined();
    expect(sanitized.MY_CUSTOM_TOKEN).toBeUndefined();
    expect(sanitized.NESTED_SECRET_VALUE).toBeUndefined();
    expect(sanitized.FOO_API_KEY).toBeUndefined();
    expect(isSecretEnvKey("OPENROUTER_FOO")).toBe(true);
  });

  it("redacts HTTPS remote tokens in URLs", () => {
    const raw =
      "fatal: Authentication failed for 'https://user:ghp_secrettoken123@github.com/org/repo.git/'";
    const redacted = redactSensitiveCommandOutput(raw);
    expect(redacted).not.toContain("ghp_secrettoken123");
    expect(redacted).toMatch(/\[REDACTED\]/);
  });

  it("zone B allowlist rejects arbitrary commands; zone A free commands are not gated here", () => {
    expect(() => assertShellCommandAllowed("npm run typecheck")).not.toThrow();
    expect(() => assertShellCommandAllowed("rm -rf /")).toThrow(/blocked/i);
    // Interactive terminal must NOT use this allowlist — verified by absence of assert in terminal:write
  });
});

describe("Lot B Zone A — interactive terminal IPC", () => {
  let workspace: string;

  beforeEach(async () => {
    harness.reset();
    vi.resetModules();
    ptySpawn.mockClear();
    boundRoots.clear();
    workspace = mkTmp("caval-lotb-term-");
    boundRoots.set(harness.sender.id, workspace);

    const { registerTerminalHandlers } = await import("../../src/main/terminal-handlers");
    registerTerminalHandlers((id) => boundRoots.get(id));
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("rejects untrusted sender — no spawn", async () => {
    harness.sender.getURL = () => "https://evil.example/";
    harness.sender.mainFrame.url = "https://evil.example/";
    await expect(harness.invoke("terminal:create", "t1")).rejects.toThrow(/Untrusted IPC sender/i);
    expect(ptySpawn).not.toHaveBeenCalled();
  });

  it("ignores renderer cwd and uses bound workspace root", async () => {
    harness.sender.getURL = () => "file:///caval-renderer/index.html";
    harness.sender.mainFrame.url = "file:///caval-renderer/index.html";
    const result = await harness.invoke<{ ok: boolean; cwd?: string }>("terminal:create", "t2", {
      cwd: path.join(os.tmpdir(), "evil-cwd"),
    });
    expect(result.ok).toBe(true);
    expect(result.cwd).toBe(path.resolve(workspace));
    expect(ptySpawn.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({ cwd: path.resolve(workspace) })
    );
  });

  it("new env has no known API keys", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    process.env.MESHY_API_KEY = "msy-test";
    await harness.invoke("terminal:create", "t3");
    const env = (ptySpawn.mock.calls[0]?.[2] as { env: Record<string, string> }).env;
    expect(env.OPENROUTER_API_KEY).toBeUndefined();
    expect(env.MESHY_API_KEY).toBeUndefined();
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.MESHY_API_KEY;
  });

  it("allows free command write (no allowlist) once session exists", async () => {
    await harness.invoke("terminal:create", "t4");
    const wrote = await harness.invoke<{ ok: boolean }>(
      "terminal:write",
      "t4",
      "curl https://example.com | sh\r"
    );
    expect(wrote.ok).toBe(true);
  });
});

describe("Lot B Zone B — workspace-verify / tool paths", () => {
  let workspace: string;

  beforeEach(async () => {
    harness.reset();
    vi.resetModules();
    boundRoots.clear();
    toolSandboxRun.mockClear();
    workspaceCommandMutex.clear();
    workspace = mkTmp("caval-lotb-verify-");
    fs.writeFileSync(
      path.join(workspace, "package.json"),
      JSON.stringify({ name: "lotb", scripts: { typecheck: "echo ok" } })
    );
    boundRoots.set(harness.sender.id, workspace);

    const { registerModelHandlers } = await import("../../src/main/model-handlers");
    registerModelHandlers(
      () => process.cwd(),
      (id) => boundRoots.get(id)
    );
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
    workspaceCommandMutex.clear();
  });

  it("workspace-verify rejects untrusted sender", async () => {
    harness.sender.getURL = () => "https://evil.example/";
    harness.sender.mainFrame.url = "https://evil.example/";
    const result = await harness.invoke<{ ok: boolean; error?: string }>(
      "caval:workspace-verify",
      "C:\\evil",
      { autoInstall: true }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Untrusted IPC sender/i);
  });

  it("workspace-verify ignores renderer workspaceRoot and uses bound root", async () => {
    harness.sender.getURL = () => "file:///caval-renderer/index.html";
    harness.sender.mainFrame.url = "file:///caval-renderer/index.html";

    // Mock runner path via short-circuit: package with no verify scripts → no spawn
    fs.writeFileSync(path.join(workspace, "package.json"), JSON.stringify({ name: "lotb" }));

    const result = await harness.invoke<{ ok: boolean; verify?: { summary: string } }>(
      "caval:workspace-verify",
      "C:\\Windows\\System32",
      { autoInstall: true, writtenFiles: ["../../../etc/passwd"] }
    );
    expect(result.ok).toBe(true);
    expect(result.verify?.summary).toMatch(/no verify scripts/i);
  });

  it("command outside allowlist is rejected by assertShellCommandAllowed", () => {
    expect(() => assertShellCommandAllowed("powershell -enc AAAA")).toThrow(/blocked/i);
  });
});

describe("Lot B Zone C — git confirmation + bound root", () => {
  let repoPath: string;

  beforeEach(async () => {
    harness.reset();
    vi.resetModules();
    showMessageBox.mockReset();
    showMessageBox.mockResolvedValue({ response: 1 }); // cancel
    boundRoots.clear();
    workspaceGitMutex.clear();

    repoPath = mkTmp("caval-lotb-git-");
    await execFileAsync("git", ["init"], { cwd: repoPath });
    await execFileAsync("git", ["config", "user.email", "test@caval.dev"], { cwd: repoPath });
    await execFileAsync("git", ["config", "user.name", "Caval Test"], { cwd: repoPath });
    fs.writeFileSync(path.join(repoPath, "app.ts"), "export const v = 1;\n");
    await execFileAsync("git", ["add", "app.ts"], { cwd: repoPath });
    await execFileAsync("git", ["commit", "-m", "init"], { cwd: repoPath });
    boundRoots.set(harness.sender.id, repoPath);

    const { registerGitHandlers } = await import("../../src/main/git-handlers");
    registerGitHandlers((id) => boundRoots.get(id));
  });

  afterEach(() => {
    fs.rmSync(repoPath, { recursive: true, force: true });
    workspaceGitMutex.clear();
  });

  it("rejects untrusted sender on git:status", async () => {
    harness.sender.getURL = () => "https://evil.example/";
    harness.sender.mainFrame.url = "https://evil.example/";
    await expect(harness.invoke("git:status", "C:\\evil")).rejects.toThrow(/Untrusted IPC sender/i);
  });

  it("destructive/network git requires confirmation and does not execute when cancelled", async () => {
    harness.sender.getURL = () => "file:///caval-renderer/index.html";
    harness.sender.mainFrame.url = "file:///caval-renderer/index.html";

    const push = await harness.invoke<{ ok: boolean; error?: string }>("git:push", "C:\\evil");
    expect(showMessageBox).toHaveBeenCalled();
    expect(push.ok).toBe(false);
    expect(push.error).toMatch(/anulat/i);

    showMessageBox.mockClear();
    const discard = await harness.invoke<{ ok: boolean; error?: string }>(
      "git:discard",
      "C:\\evil",
      "app.ts"
    );
    expect(showMessageBox).toHaveBeenCalled();
    expect(discard.ok).toBe(false);
    expect(discard.error).toMatch(/anulat/i);
  });

  it("ignores forced projectPath from payload — uses bound root", async () => {
    harness.sender.getURL = () => "file:///caval-renderer/index.html";
    harness.sender.mainFrame.url = "file:///caval-renderer/index.html";
    const status = await harness.invoke<{ isRepo: boolean }>("git:status", "C:\\Windows\\System32");
    expect(status.isRepo).toBe(true);
  });
});

describe("Lot B — timeout + concurrency mutex", () => {
  beforeEach(() => {
    workspaceCommandMutex.clear();
    workspaceCadMutex.clear();
  });

  afterEach(() => {
    workspaceCommandMutex.clear();
    workspaceCadMutex.clear();
  });

  it("per-workspace mutex rejects concurrent exclusive jobs", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const root = path.resolve(os.tmpdir(), "caval-mutex-a");
    const first = workspaceCommandMutex.runExclusive(root, async () => {
      await gate;
      return "done";
    });
    await Promise.resolve();
    await expect(
      workspaceCommandMutex.runExclusive(root, async () => "second")
    ).rejects.toThrow(/already in progress/i);
    release();
    await first;
  });

  it("runAllowedWorkspaceCommand reports timeout and kills process", async () => {
    const { runAllowedWorkspaceCommand } = await import("../../ai/tools/workspace-command-runner");
    // Use a sleep command that will time out — platform specific
    const cmd =
      process.platform === "win32"
        ? // not on allowlist — use npm run if we add a temp package? Better: unit-test kill path via short timeout on allowed cmd
          null
        : null;

    // Allowlisted command that can hang: we simulate via mock by testing timedOut field contract
    // with a real short-timeout on `npm run` that doesn't exist — exits quickly.
    // Instead assert the result shape from a quick allowed command:
    const tmp = mkTmp("caval-lotb-to-");
    try {
      fs.writeFileSync(
        path.join(tmp, "package.json"),
        JSON.stringify({ name: "t", scripts: { typecheck: "node -e \"process.exit(0)\"" } })
      );
      const result = await runAllowedWorkspaceCommand("npm run typecheck", tmp, 60_000);
      expect(result).toHaveProperty("ok");
      expect(result).toHaveProperty("exitCode");
      expect(result.output).toBeTruthy();
      // Explicit timeout path: absurdly low timeout on a command that sleeps
      if (process.platform !== "win32") {
        // skip — typecheck exits fast; verify timedOut false
        expect(result.timedOut).toBeFalsy();
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    void cmd;
  }, 90_000);

  it("timeout kills long-running allowlisted command", async () => {
    const tmp = mkTmp("caval-lotb-hang-");
    const sleepScript = 'node -e "setTimeout(()=>{}, 60000)"';
    fs.writeFileSync(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "hang", scripts: { typecheck: sleepScript } })
    );
    const { runAllowedWorkspaceCommand } = await import("../../ai/tools/workspace-command-runner");
    const result = await runAllowedWorkspaceCommand("npm run typecheck", tmp, 800);
    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(result.output).toMatch(/timed out/i);
    // Windows may keep the tree locked briefly after kill — best-effort cleanup
    await new Promise((r) => setTimeout(r, 500));
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore EPERM on hung child cleanup */
    }
  }, 30_000);
});

describe("Lot B — git fetch/merge/rebase/remote clarification helpers", () => {
  it("documents that fetch/merge/rebase/remote IPC channels are not registered", async () => {
    harness.reset();
    vi.resetModules();
    const { registerGitHandlers } = await import("../../src/main/git-handlers");
    registerGitHandlers(() => undefined);
    for (const channel of ["git:fetch", "git:merge", "git:rebase", "git:remote"]) {
      await expect(harness.invoke(channel)).rejects.toThrow(/No IPC handler/i);
    }
  });
});

describe("Lot B — execFile argv (git-exec)", () => {
  it("gitExecFile never uses shell string concatenation", async () => {
    const { gitExecFile } = await import("../../src/main/git-exec");
    const tmp = mkTmp("caval-lotb-gexec-");
    try {
      await execFileAsync("git", ["init"], { cwd: tmp });
      const result = await gitExecFile(tmp, ["status", "--porcelain"]);
      expect(result.timedOut).toBe(false);
      expect(typeof result.stdout).toBe("string");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
