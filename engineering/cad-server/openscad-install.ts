import { spawn } from "node:child_process";
import { isOpenScadInstalled, resetOpenScadProbeCacheForTests } from "./scad-runner";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function runWingetInstall(): Promise<number | null> {
  return new Promise((resolve) => {
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
      { shell: true, windowsHide: false }
    );
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code));
  });
}

function runBrewInstall(): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn("brew", ["install", "--cask", "openscad"], { shell: false });
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code));
  });
}

/** Install OpenSCAD via winget/brew; shows OS installer/UAC when needed. */
export async function tryInstallOpenScad(): Promise<{ ok: boolean; error?: string }> {
  resetOpenScadProbeCacheForTests();
  if (await isOpenScadInstalled()) {
    return { ok: true };
  }

  let exitCode: number | null = null;
  if (process.platform === "win32") {
    exitCode = await runWingetInstall();
  } else if (process.platform === "darwin") {
    exitCode = await runBrewInstall();
  } else {
    return { ok: false, error: "Instalare automată disponibilă doar pe Windows și macOS." };
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
      error: "OpenSCAD instalat dar nu a fost detectat. Repornește aplicația sau adaugă OPENSCAD_PATH în .env.",
    };
  }

  return {
    ok: false,
    error:
      exitCode === null
        ? "Nu am putut porni instalatorul. Rulează manual: winget install OpenSCAD.OpenSCAD"
        : "Instalare anulată sau eșuată. Aprobă dialogul UAC și încearcă din nou.",
  };
}
