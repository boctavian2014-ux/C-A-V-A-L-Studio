import { describe, expect, it } from "vitest";

import {
  allowsDiskWrites,
  looksLikeExplicitCreate,
  resolveExecutionMode,
  resolveTrustedExecutionCapability,
  stricterExecutionMode,
} from "../../ai/modes/execution-mode";
import { buildAgenticRepairMessage } from "../../ai/prompts/agentic-repair";

describe("execution-mode", () => {
  it("routes explanation and inspect requests to READ_ONLY", () => {
    const cases = [
      "explică index.html",
      "ce face index.html?",
      "analizează structura proiectului",
      "verifică folderul",
      "unde am rămas?",
      "arată-mi ce face acest fișier",
      "Explică-mi rolul fișierului index.html",
    ];
    for (const text of cases) {
      expect(resolveExecutionMode(text), text).toBe("READ_ONLY");
      expect(allowsDiskWrites(resolveExecutionMode(text))).toBe(false);
    }
  });

  it("routes explicit create to PROPOSE_EDIT, apply to APPLY_EDIT", () => {
    expect(looksLikeExplicitCreate("Creează un index.html simplu")).toBe(true);
    expect(looksLikeExplicitCreate("build app")).toBe(true);
    expect(resolveExecutionMode("build app")).toBe("PROPOSE_EDIT");
    expect(resolveExecutionMode("Creează un index.html simplu")).toBe("PROPOSE_EDIT");
    expect(allowsDiskWrites(resolveExecutionMode("Creează un index.html simplu"))).toBe(false);
    expect(resolveExecutionMode("Aplică schimbarea")).toBe("APPLY_EDIT");
    expect(allowsDiskWrites(resolveExecutionMode("Aplică schimbarea"))).toBe(true);
  });

  it("routes internal repair continue to AGENTIC_REPAIR", () => {
    expect(resolveExecutionMode(buildAgenticRepairMessage({ wave: 0 }))).toBe("AGENTIC_REPAIR");
    expect(allowsDiskWrites(resolveExecutionMode(buildAgenticRepairMessage({ wave: 0 })))).toBe(true);
  });

  it("lets the renderer reduce privileges but never escalate", () => {
    expect(stricterExecutionMode("APPLY_EDIT", "READ_ONLY")).toBe("READ_ONLY");
    expect(stricterExecutionMode("READ_ONLY", "SCAFFOLD")).toBe("READ_ONLY");
    const spoof = resolveTrustedExecutionCapability({
      userMessage: "explică index.html",
      rendererRequestedMode: "SCAFFOLD",
    });
    expect(spoof.effective).toBe("READ_ONLY");
  });
});
