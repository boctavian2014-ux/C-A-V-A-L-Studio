/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";

import { projectNameFromPrompt } from "../../src/renderer/hooks/project-name-from-prompt";

describe("projectNameFromPrompt", () => {
  it("strips Romanian create verbs", () => {
    expect(projectNameFromPrompt("Creează magazin online cu React")).toMatch(/magazin/i);
  });

  it("falls back when empty", () => {
    expect(projectNameFromPrompt("   ")).toBe("Caval-Project");
  });
});
