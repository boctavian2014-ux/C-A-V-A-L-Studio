import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  isWatchdogTimeoutError,
  planFinishDiskWrites,
  planFinishDiskWritesForUserMessage,
  shouldAutoCreateDesktopWorkspace,
} from "../../ai/composer/finish-disk-write-gate";
import { TURN_WATCHDOG_ABORT_REASON } from "../../src/shared/turn-watchdog";
import { applyScaffoldToWorkspace } from "../../ai/composer/scaffold-apply";
import { parseScaffoldFiles } from "../../ai/composer/scaffold-parser";
import { applyFallbackScaffold } from "../../ai/composer/fallback-scaffold";

const FENCE_HTML = [
  "```html:index.html",
  "<!DOCTYPE html><html><body><h1>x</h1><!-- p03-watchdog --></body></html>",
  "```",
].join("\n");

describe("P0.4 finish() disk-write gate", () => {
  it("fence-only READ_ONLY explain does not plan any disk mutation", () => {
    const plan = planFinishDiskWritesForUserMessage({
      userMessage: "Explică-mi rolul fișierului index.html.",
    });
    expect(plan.applyParsedFences).toBe(false);
    expect(plan.applyFallbackScaffold).toBe(false);
    expect(plan.autoInstallDependencies).toBe(false);
    expect(plan.allowWriteFollowup).toBe(false);
  });

  it("fence-only PROPOSE_EDIT create intent is proposal-only — zero finish() writes", () => {
    const plan = planFinishDiskWritesForUserMessage({
      userMessage: "Creează un index.html simplu",
    });
    expect(plan.applyParsedFences).toBe(false);
    expect(plan.applyFallbackScaffold).toBe(false);
    expect(plan.autoInstallDependencies).toBe(false);
    expect(plan.allowWriteFollowup).toBe(false);
  });

  it("UI-looking agentic add-comment prompt never applies fences or fallback from finish()", () => {
    const plan = planFinishDiskWritesForUserMessage({
      userMessage:
        "Adaugă în index.html un comentariu HTML <!-- p03-watchdog --> imediat după h1. Nu crea alte fișiere. Doar propune modificarea.",
    });
    expect(plan.applyParsedFences).toBe(false);
    expect(plan.applyFallbackScaffold).toBe(false);
  });

  it("watchdog timeout cleanup does not trigger scaffold apply or fallback", () => {
    const plan = planFinishDiskWritesForUserMessage({
      userMessage: "Aplică schimbarea",
      error: TURN_WATCHDOG_ABORT_REASON,
      timedOut: true,
    });
    expect(isWatchdogTimeoutError(TURN_WATCHDOG_ABORT_REASON)).toBe(true);
    expect(plan.applyParsedFences).toBe(false);
    expect(plan.applyFallbackScaffold).toBe(false);
    expect(plan.autoInstallDependencies).toBe(false);
    expect(plan.allowWriteFollowup).toBe(false);
  });

  it("timeout flag alone is enough even if the original turn would have been APPLY_EDIT", () => {
    const plan = planFinishDiskWrites({
      timedOut: true,
      hasProposedWrites: false,
      effectiveMode: "APPLY_EDIT",
      writeTurnGranted: true,
    });
    expect(plan.applyParsedFences).toBe(false);
    expect(plan.applyFallbackScaffold).toBe(false);
    expect(plan.autoInstallDependencies).toBe(false);
    expect(plan.allowWriteFollowup).toBe(false);
  });

  it("proposedWrites skip finish() disk writes (Accept is the only apply path)", () => {
    const plan = planFinishDiskWrites({
      hasProposedWrites: true,
      effectiveMode: "PROPOSE_EDIT",
      writeTurnGranted: false,
    });
    expect(plan.applyParsedFences).toBe(false);
    expect(plan.applyFallbackScaffold).toBe(false);
    expect(plan.autoInstallDependencies).toBe(false);
  });

  it("approved APPLY_EDIT applies fences from finish() but not invented fallback", () => {
    const plan = planFinishDiskWrites({
      hasProposedWrites: false,
      effectiveMode: "APPLY_EDIT",
      writeTurnGranted: true,
    });
    expect(plan.applyParsedFences).toBe(true);
    expect(plan.applyFallbackScaffold).toBe(false);
    expect(plan.autoInstallDependencies).toBe(true);
    expect(plan.allowWriteFollowup).toBe(true);
  });

  it("SCAFFOLD create-and-write applies fences and fallback from finish()", () => {
    const plan = planFinishDiskWritesForUserMessage({
      userMessage:
        "Creează un index.html simplu. Scrie efectiv fișierele în workspace.",
    });
    expect(plan.applyParsedFences).toBe(true);
    expect(plan.applyFallbackScaffold).toBe(true);
    expect(plan.autoInstallDependencies).toBe(true);
    expect(plan.allowWriteFollowup).toBe(true);
  });

  it("hang/timeout plus a parseable fence still means zero applyScaffold/fallback calls", () => {
    const parsed = parseScaffoldFiles(FENCE_HTML);
    expect(parsed.length).toBeGreaterThan(0);
    const plan = planFinishDiskWritesForUserMessage({
      userMessage: "Rămâi în așteptare și continuă să generezi. Nu încheia răspunsul.",
      error: TURN_WATCHDOG_ABORT_REASON,
      timedOut: true,
    });
    expect(plan.applyParsedFences).toBe(false);
    expect(plan.applyFallbackScaffold).toBe(false);
  });
});

describe("P0.4 callers must not write when the plan forbids it", () => {
  it("does not invoke applyScaffoldToWorkspace for a forbidden fence plan", async () => {
    const plan = planFinishDiskWritesForUserMessage({
      userMessage: "Explică-mi rolul fișierului index.html.",
    });
    const writes: string[] = [];
    if (plan.applyParsedFences) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-p04-fence-"));
      await applyScaffoldToWorkspace(root, parseScaffoldFiles(FENCE_HTML));
      writes.push(...fs.readdirSync(root));
    }
    expect(writes).toEqual([]);
  });

  it("does not invoke applyFallbackScaffold on timeout", async () => {
    const plan = planFinishDiskWritesForUserMessage({
      userMessage: "Aplică schimbarea",
      timedOut: true,
      error: TURN_WATCHDOG_ABORT_REASON,
    });
    let called = false;
    if (plan.applyFallbackScaffold) {
      called = true;
      await applyFallbackScaffold("C:\\proj");
    }
    expect(called).toBe(false);
  });
});

describe("P0.4 auto-create Desktop workspace", () => {
  it("does not invent a Desktop folder for explain or hang prompts", () => {
    expect(shouldAutoCreateDesktopWorkspace("Explică-mi rolul fișierului index.html.")).toBe(
      false
    );
    expect(
      shouldAutoCreateDesktopWorkspace(
        "Rămâi în așteptare și continuă să generezi. Nu încheia răspunsul."
      )
    ).toBe(false);
    expect(shouldAutoCreateDesktopWorkspace("Creează un index.html simplu")).toBe(false);
  });

  it("still allows auto-create only for write-capable apply/repair/scaffold messages", () => {
    expect(shouldAutoCreateDesktopWorkspace("Aplică schimbarea")).toBe(true);
    expect(
      shouldAutoCreateDesktopWorkspace(
        "Creează un index.html simplu. Scrie efectiv fișierele în workspace."
      )
    ).toBe(true);
  });
});
