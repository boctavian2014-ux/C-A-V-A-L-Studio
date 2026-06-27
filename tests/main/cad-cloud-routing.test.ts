import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { applyCadCloudEnvDefaults, isCadCloudOnly } from "../../src/main/cad-config";
import { normalizeCadApiUrl } from "../../src/main/cad-handlers";

describe("CAD cloud routing", () => {
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ["CAD_CLOUD_ONLY", "CAD_API_URL", "CAD_CLOUD_URL"]) {
      prev[k] = process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("cloud-only mode skips local URL", () => {
    process.env.CAD_CLOUD_ONLY = "1";
    applyCadCloudEnvDefaults();
    expect(process.env.CAD_API_URL).toMatch(/railway\.app/);
    expect(isCadCloudOnly()).toBe(true);
  });

  it("normalizeCadApiUrl adds https", () => {
    expect(normalizeCadApiUrl("foo.railway.app")).toBe("https://foo.railway.app");
  });
});
