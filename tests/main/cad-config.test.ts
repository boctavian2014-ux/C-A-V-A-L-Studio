import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  applyCadCloudEnvDefaults,
  DEFAULT_CAD_CLOUD_URL,
  isCadCloudOnly,
  readCadConfigFromCavalJsonc,
} from "../../src/main/cad-config";

describe("cad-config", () => {
  const prevEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    prevEnv.CAD_CLOUD_ONLY = process.env.CAD_CLOUD_ONLY;
    prevEnv.CAD_API_URL = process.env.CAD_API_URL;
  });

  afterEach(() => {
    process.env.CAD_CLOUD_ONLY = prevEnv.CAD_CLOUD_ONLY;
    process.env.CAD_API_URL = prevEnv.CAD_API_URL;
  });

  it("reads cad section from caval.jsonc", () => {
    const cad = readCadConfigFromCavalJsonc();
    expect(cad.apiUrl).toContain("railway.app");
    expect(cad.cloudOnly).toBe(true);
  });

  it("applyCadCloudEnvDefaults sets CAD_API_URL when cloud only", () => {
    delete process.env.CAD_API_URL;
    process.env.CAD_CLOUD_ONLY = "1";
    applyCadCloudEnvDefaults();
    expect(process.env.CAD_API_URL).toBeTruthy();
  });

  it("DEFAULT_CAD_CLOUD_URL is https", () => {
    expect(DEFAULT_CAD_CLOUD_URL).toMatch(/^https:\/\//);
  });

  it("isCadCloudOnly respects CAD_CLOUD_ONLY=0", () => {
    process.env.CAD_CLOUD_ONLY = "0";
    expect(isCadCloudOnly()).toBe(false);
  });
});
