import { describe, expect, it } from "vitest";
import { CAVALO_RELEASE_ENGINEER_PROMPT } from "../../ai/prompts/cavalo-release-engineer";

describe("cavalo release engineer prompt", () => {
  it("references real release scripts", () => {
    expect(CAVALO_RELEASE_ENGINEER_PROMPT).toContain("npm run release:win");
    expect(CAVALO_RELEASE_ENGINEER_PROMPT).toContain("release-report.json");
  });

  it("forbids hallucinated installers and certificates", () => {
    expect(CAVALO_RELEASE_ENGINEER_PROMPT.toLowerCase()).toContain("do not");
    expect(CAVALO_RELEASE_ENGINEER_PROMPT).toContain("setup.exe");
    expect(CAVALO_RELEASE_ENGINEER_PROMPT).toContain("SmartScreen");
  });
});
