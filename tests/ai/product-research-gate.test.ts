import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  queryAgenticCloudProviderAvailable,
  resolveProductBuildMode,
  shouldUseCodeInsteadOfAgentic,
} from "../../ai/research/research-gate";

describe("product build mode", () => {
  it("does not read process.env or agentic-routing-policy from the renderer gate", () => {
    const source = readFileSync(
      path.join(__dirname, "../../ai/research/research-gate.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/hasAgenticCloudProvider/);
    expect(source).not.toMatch(/agentic-routing-policy/);
  });

  it("keeps Code mode when Agentic IPC reports no cloud provider", async () => {
    const none = { getAgenticAvailability: async () => ({ ok: true, available: false }) };
    expect(await resolveProductBuildMode("agentic", none)).toBe("code");
    expect(await resolveProductBuildMode("code", none)).toBe("code");
    expect(shouldUseCodeInsteadOfAgentic("agentic", false)).toBe(true);
  });

  it("keeps Agentic when main reports a configured cloud provider", async () => {
    const nvidia = { getAgenticAvailability: async () => ({ ok: true, available: true }) };
    expect(await resolveProductBuildMode("agentic", nvidia)).toBe("agentic");
    expect(shouldUseCodeInsteadOfAgentic("agentic", true)).toBe(false);
  });

  it("falls back to Code when IPC is missing or throws", async () => {
    expect(await resolveProductBuildMode("agentic")).toBe("code");
    expect(await resolveProductBuildMode("agentic", {})).toBe("code");
    expect(
      await resolveProductBuildMode("agentic", {
        getAgenticAvailability: async () => {
          throw new Error("ipc down");
        },
      })
    ).toBe("code");
    expect(await queryAgenticCloudProviderAvailable()).toBe(false);
  });
});
