/**
 * Windows shell resolution for CAVALLO terminals.
 * Prefers PowerShell 7+ (pwsh); installs latest via winget when missing.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type WindowsShellKind = "pwsh" | "powershell";

export interface ResolvedShell {
  command: string;
  kind: WindowsShellKind | "bash" | "shell";
  /** Args for an interactive login shell (PTY / persistent). */
  interactiveArgs: string[];
  label: string;
}

const PWSH_FIXED_CANDIDATES_WIN = [
  path.join(process.env.ProgramFiles ?? "C:\\Program Files", "PowerShell", "7", "pwsh.exe"),
  path.join(process.env.ProgramFiles ?? "C:\\Program Files", "PowerShell", "7-preview", "pwsh.exe"),
  path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WindowsApps", "pwsh.exe"),
];

function pwshCandidatesWin(): string[] {
  return [process.env.PWSH_PATH, ...PWSH_FIXED_CANDIDATES_WIN].filter(Boolean) as string[];
}
let cachedPwsh: string | null | undefined;
let installInFlight: Promise<{ ok: boolean; error?: string; path?: string }> | null = null;
let upgradeAttemptedThisProcess = false;

function whichSync(bin: string): string | null {
  try {
    const result = spawnSync(process.platform === "win32" ? "where" : "which", [bin], {
      encoding: "utf8",
      windowsHide: true,
      shell: false,
    });
    if (result.status !== 0) return null;
    const lines = (result.stdout || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const candidate of lines) {
      // App Execution Aliases under WindowsApps often fail existsSync but still spawn.
      if (fs.existsSync(candidate) || candidate.toLowerCase().includes("\\windowsapps\\")) {
        return candidate;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function findMsixPwshExecutable(): string | null {
  const windowsApps = path.join(process.env.ProgramFiles ?? "C:\\Program Files", "WindowsApps");
  try {
    if (!fs.existsSync(windowsApps)) return null;
    const dirs = fs
      .readdirSync(windowsApps)
      .filter((name) => /^Microsoft\.PowerShell_/i.test(name))
      .sort()
      .reverse();
    for (const dir of dirs) {
      const candidate = path.join(windowsApps, dir, "pwsh.exe");
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
    // WindowsApps may deny directory listing for non-elevated processes.
  }
  return null;
}

/** Absolute path to pwsh.exe when PowerShell 7+ is installed. */
export function findPwshExecutable(): string | null {
  if (cachedPwsh !== undefined) return cachedPwsh;

  if (process.platform !== "win32") {
    cachedPwsh = whichSync("pwsh");
    return cachedPwsh;
  }

  for (const candidate of pwshCandidatesWin()) {
    if (candidate && fs.existsSync(candidate)) {
      cachedPwsh = candidate;
      return cachedPwsh;
    }
  }

  // Prefer the real MSIX package binary over the WindowsApps execution alias.
  cachedPwsh =
    findMsixPwshExecutable() ?? whichSync("pwsh.exe") ?? whichSync("pwsh");
  return cachedPwsh;
}

export function resetPwshCacheForTests(): void {
  cachedPwsh = undefined;
  installInFlight = null;
  upgradeAttemptedThisProcess = false;
}

export function isPowerShell7Installed(): boolean {
  return Boolean(findPwshExecutable());
}

/** Shell used by integrated PTY / spawn helpers. */
export function resolvePreferredShell(): ResolvedShell {
  if (process.platform === "win32") {
    const pwsh = findPwshExecutable();
    if (pwsh) {
      return {
        command: pwsh,
        kind: "pwsh",
        interactiveArgs: ["-NoLogo"],
        label: "PowerShell 7",
      };
    }
    return {
      command: "powershell.exe",
      kind: "powershell",
      interactiveArgs: ["-NoLogo", "-ExecutionPolicy", "Bypass"],
      label: "Windows PowerShell",
    };
  }

  const shell = process.env.SHELL?.trim() || "/bin/bash";
  return {
    command: shell,
    kind: shell.includes("bash") ? "bash" : "shell",
    interactiveArgs: ["-l"],
    label: path.basename(shell),
  };
}

function runWingetPowerShell(action: "install" | "upgrade"): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(
      "winget",
      [
        action,
        "--id",
        "Microsoft.PowerShell",
        "-e",
        // Prefer classic MSI (Program Files\PowerShell\7) over MSIX app alias.
        "--installer-type",
        "wix",
        "--accept-package-agreements",
        "--accept-source-agreements",
      ],
      { shell: true, windowsHide: false }
    );
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Install / upgrade to latest PowerShell 7 via winget (Windows only).
 * Dedupes concurrent install calls. Upgrade runs at most once per process.
 */
export async function ensureLatestPowerShellInstalled(): Promise<{
  ok: boolean;
  already?: boolean;
  upgraded?: boolean;
  error?: string;
  path?: string;
}> {
  if (process.platform !== "win32") {
    return { ok: true, already: true };
  }

  cachedPwsh = undefined;
  const existing = findPwshExecutable();
  if (existing) {
    if (!upgradeAttemptedThisProcess) {
      upgradeAttemptedThisProcess = true;
      void runWingetPowerShell("upgrade").then(() => {
        cachedPwsh = undefined;
      });
    }
    return { ok: true, already: true, path: existing };
  }

  if (!installInFlight) {
    installInFlight = (async () => {
      const exitCode = await runWingetPowerShell("install");
      for (let i = 0; i < 12; i++) {
        await sleep(1_500);
        cachedPwsh = undefined;
        const found = findPwshExecutable();
        if (found) return { ok: true, path: found };
      }
      if (exitCode === 0) {
        return {
          ok: false,
          error:
            "PowerShell 7 instalat, dar pwsh nu e pe PATH. Repornește CAVALLO sau deschide un terminal nou.",
        };
      }
      return {
        ok: false,
        error:
          exitCode === null
            ? "Nu am putut porni winget. Rulează: winget install --id Microsoft.PowerShell -e"
            : "Instalare PowerShell 7 anulată sau eșuată. Aprobă UAC și reîncearcă.",
      };
    })().finally(() => {
      installInFlight = null;
    });
  }

  return installInFlight;
}

/** Args for running a one-shot command string in the preferred shell. */
export function oneShotShellInvocation(command: string): { file: string; args: string[] } {
  if (process.platform === "win32") {
    const shell = resolvePreferredShell();
    return {
      file: shell.command,
      args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
    };
  }
  const shell = process.env.SHELL?.trim() || "/bin/bash";
  return { file: shell, args: ["-lc", command] };
}

export function defaultTerminalTabTitle(index: number): string {
  if (process.platform !== "win32") {
    return `terminal ${index}`;
  }
  return isPowerShell7Installed() ? `pwsh ${index}` : `powershell ${index}`;
}
