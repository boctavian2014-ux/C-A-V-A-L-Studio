import { spawn } from "node:child_process";
import { isOpenScadInstalled, resetOpenScadProbeCacheForTests } from "./scad-runner";
import { sanitizeEnvForTerminal } from "../../src/main/subprocess-env";
import { workspaceCadMutex } from "../../ai/tools/workspace-execute-lock";
import { redactSensitiveCommandOutput } from "../../src/shared/command-output-redaction";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const INSTALL_TIMEOUT_MS = 10 * 60_000;

function runWingetInstall(): Promise<number | null> {
  return new Promise((resolve) => {
    // Lot B Zone D: fixed argv in main — no renderer command string; shell:false
    const child = spawn(
      "winget",
      [
        "install",
        "--id",
        "OpenSCAD.OpenSCAD",
        "-e",
        "--accept-package-agreements",
        "--accept-source-agreements",
      ],
      {
        shell: false,
        windowsHide: false,
        env: sanitizeEnvForTerminal(),
      }
    );
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, INSTALL_TIMEOUT_MS);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

function runBrewInstall(): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn("brew", ["install", "--cask", "openscad"], {
      shell: false,
      env: sanitizeEnvForTerminal(),
    });
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, INSTALL_TIMEOUT_MS);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

/** Install OpenSCAD via winget/brew; shows OS installer/UAC when needed. */
export async function tryInstallOpenScad(): Promise<{ ok: boolean; error?: string }> {
  return workspaceCadMutex.runExclusive("cad:installOpenScad", async () => {
    resetOpenScadProbeCacheForTests();
    if (await isOpenScadInstalled()) {
      return { ok: true };
    }

    let exitCode: number | null = null;
    try {
      if (process.platform === "win32") {
        exitCode = await runWingetInstall();
      } else if (process.platform === "darwin") {
        exitCode = await runBrewInstall();
      } else {
        return { ok: false, error: "Instalare automată disponibilă doar pe Windows și macOS." };
      }
    } catch (error) {
      return {
        ok: false,
        error: redactSensitiveCommandOutput(
          error instanceof Error ? error.message : String(error)
        ),
      };
    }

    for (let i = 0; i < 8; i++) {
      await sleep(1_500);
      resetOpenScadProbeCacheForTests();
      if (await isOpenScadInstalled()) {
        return { ok: true };
      }
    }

    if (exitCode === 0) {
      return {
        ok: false,
        error:
          "OpenSCAD instalat dar nu a fost detectat. Repornește aplicația sau adaugă OPENSCAD_PATH în .env.",
      };
    }

    return {
      ok: false,
      error:
        exitCode === null
          ? "Nu am putut porni instalatorul. Rulează manual: winget install OpenSCAD.OpenSCAD"
          : "Instalare anulată sau eșuată. Aprobă dialogul UAC și încearcă din nou.",
    };
  });
}
