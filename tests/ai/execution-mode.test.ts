import { describe, expect, it } from "vitest";

import {
  allowsDiskWrites,
  looksLikeExplicitCreate,
  looksLikeExplicitWriteRequest,
  looksLikeProductBuildIntent,
  looksLikeScaffoldCreate,
  resolveExecutionMode,
  resolveTrustedExecutionCapability,
  shouldGrantChatWriteTurn,
  stricterExecutionMode,
} from "../../ai/modes/execution-mode";
import { buildAgenticRepairMessage } from "../../ai/prompts/agentic-repair";

const WEBSITE_CREATE_WRITE =
  "Creează un website de prezentare pentru CAVAL Studio, în folderul curent. Vreau un site modern, dark, orientat către developeri, cu fundal negru, accent cyan/mov, logo CAVAL în header, secțiuni Hero, Funcționalități, Cum funcționează, Beneficii, Call to Action și Footer. Creează toate fișierele necesare pentru a putea porni și previzualiza proiectul local. Nu răspunde doar cu explicații: scrie efectiv fișierele proiectului în workspace.";

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
    expect(resolveExecutionMode("build app")).toBe("SCAFFOLD");
    expect(resolveExecutionMode("Creează un index.html simplu")).toBe("PROPOSE_EDIT");
    expect(allowsDiskWrites(resolveExecutionMode("Creează un index.html simplu"))).toBe(false);
    expect(resolveExecutionMode("Aplică schimbarea")).toBe("APPLY_EDIT");
    expect(allowsDiskWrites(resolveExecutionMode("Aplică schimbarea"))).toBe(true);
  });

  it("routes create-and-write to SCAFFOLD, not PROPOSE_EDIT", () => {
    const simpleWrite =
      "Creează un index.html simplu. Scrie efectiv fișierele în workspace.";
    expect(looksLikeExplicitWriteRequest(simpleWrite)).toBe(true);
    expect(looksLikeScaffoldCreate(simpleWrite)).toBe(true);
    expect(resolveExecutionMode(simpleWrite)).toBe("SCAFFOLD");
    expect(allowsDiskWrites(resolveExecutionMode(simpleWrite))).toBe(true);
    expect(shouldGrantChatWriteTurn(resolveTrustedExecutionCapability({ userMessage: simpleWrite }))).toBe(
      true
    );

    expect(looksLikeScaffoldCreate(WEBSITE_CREATE_WRITE)).toBe(true);
    expect(resolveExecutionMode(WEBSITE_CREATE_WRITE)).toBe("SCAFFOLD");
    expect(allowsDiskWrites(resolveExecutionMode(WEBSITE_CREATE_WRITE))).toBe(true);
    expect(
      shouldGrantChatWriteTurn(resolveTrustedExecutionCapability({ userMessage: WEBSITE_CREATE_WRITE }))
    ).toBe(true);
  });

  it("does not treat 'nu răspunde doar cu explicații' as READ_ONLY", () => {
    expect(resolveExecutionMode(WEBSITE_CREATE_WRITE)).not.toBe("READ_ONLY");
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

  it("treats vague product briefs as create intent without file paths", () => {
    const briefs = [
      "fă un landing page",
      "fă un magazin",
      "fă un site de baschet",
      "creează proiectul",
      "fa un app",
    ];
    for (const text of briefs) {
      expect(looksLikeProductBuildIntent(text), text).toBe(true);
      expect(looksLikeExplicitCreate(text), text).toBe(true);
      expect(looksLikeScaffoldCreate(text), text).toBe(true);
      expect(looksLikeExplicitWriteRequest(text), text).toBe(false);
      expect(resolveExecutionMode(text), text).toBe("SCAFFOLD");
      expect(resolveExecutionMode(text, "code"), text).toBe("SCAFFOLD");
      expect(
        shouldGrantChatWriteTurn(resolveTrustedExecutionCapability({ userMessage: text })),
        text
      ).toBe(true);
      expect(
        shouldGrantChatWriteTurn(resolveTrustedExecutionCapability({ userMessage: text, agentMode: "code" })),
        text
      ).toBe(true);
    }
    expect(looksLikeProductBuildIntent("Explică-mi rolul fișierului index.html.")).toBe(false);
    expect(looksLikeProductBuildIntent("Creează hello.txt cu Hello")).toBe(false);
    expect(looksLikeProductBuildIntent("Creează un website de prezentare")).toBe(true);
    expect(looksLikeProductBuildIntent("fă o listă")).toBe(false);
  });

  it("keeps Ask and Plan read-only even for explicit write prompts", () => {
    const productPrompt = "fă un magazin de baschet";
    const writePrompt = "Creează un index.html simplu. Scrie efectiv fișierele în workspace.";
    expect(resolveExecutionMode(productPrompt, "ask")).toBe("READ_ONLY");
    expect(resolveExecutionMode(productPrompt, "plan")).toBe("READ_ONLY");
    expect(resolveExecutionMode(writePrompt, "ask")).toBe("READ_ONLY");
    expect(resolveExecutionMode(writePrompt, "plan")).toBe("READ_ONLY");
    expect(
      shouldGrantChatWriteTurn(
        resolveTrustedExecutionCapability({ userMessage: productPrompt, agentMode: "ask" })
      )
    ).toBe(false);
    expect(
      shouldGrantChatWriteTurn(
        resolveTrustedExecutionCapability({ userMessage: writePrompt, agentMode: "plan" })
      )
    ).toBe(false);
  });
});

