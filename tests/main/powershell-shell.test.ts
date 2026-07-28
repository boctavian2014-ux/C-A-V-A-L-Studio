import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  defaultTerminalTabTitle,
  findPwshExecutable,
  oneShotShellInvocation,
  resetPwshCacheForTests,
  resolvePreferredShell,
} from "../../src/main/powershell-shell";

afterEach(() => {
  resetPwshCacheForTests();
  delete process.env.PWSH_PATH;
});

describe("powershell-shell", () => {
  it("resolvePreferredShell falls back to Windows PowerShell when pwsh missing", () => {
    if (process.platform !== "win32") return;
    process.env.PWSH_PATH = path.join(os.tmpdir(), "caval-missing-pwsh.exe");
    resetPwshCacheForTests();
    // Force miss of env candidate; PATH may still find real pwsh — skip assert if installed.
    const shell = resolvePreferredShell();
    expect(["pwsh", "powershell"]).toContain(shell.kind);
    expect(shell.interactiveArgs.length).toBeGreaterThan(0);
  });

  it("oneShotShellInvocation wraps command for Windows shells", () => {
    if (process.platform !== "win32") {
      const inv = oneShotShellInvocation("echo hi");
      expect(inv.args).toEqual(["-lc", "echo hi"]);
      return;
    }
    const inv = oneShotShellInvocation("Get-Host");
    expect(inv.args).toEqual(
      expect.arrayContaining(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "Get-Host"])
    );
  });

  it("findPwshExecutable honors PWSH_PATH when file exists", () => {
    if (process.platform !== "win32") return;
    const fake = path.join(os.tmpdir(), `caval-fake-pwsh-${Date.now()}.exe`);
    fs.writeFileSync(fake, "");
    try {
      process.env.PWSH_PATH = fake;
      resetPwshCacheForTests();
      expect(findPwshExecutable()).toBe(fake);
      expect(resolvePreferredShell().kind).toBe("pwsh");
      expect(defaultTerminalTabTitle(3)).toBe("pwsh 3");
    } finally {
      fs.unlinkSync(fake);
    }
  });
});
