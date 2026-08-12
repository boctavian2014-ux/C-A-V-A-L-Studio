import { randomBytes, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCadServer } from "../../engineering/cad-server/server";
import { resetCadJobsForTests } from "../../engineering/cad-server/memory-store";
import { resetCadRateLimitsForTests } from "../../engineering/cad-server/middleware/rate-limit";
import { resetJobRegistryForTests } from "../../engineering/cad-server/services/job-registry";
import { resetAllJobLogsForTests } from "../../engineering/cad-server/services/job-logger";
import { resetLocalArtifactsForTests } from "../../engineering/cad-server/storage/local-artifacts";
import { resetProviderProfilesForTests } from "../../engineering/cad-server/services/provider-profiles";
import * as profileSecret from "../../engineering/cad-server/crypto/profile-secret";
import {
  applyResolvedSecretToCadInput,
  resolveOwnedActiveProfileSecret,
} from "../../engineering/cad-server/services/provider-profiles";

const JWT_SECRET = "cad-pr1-test-jwt-secret";
const ENC_KEY = randomBytes(32).toString("hex");
const VAULT_SECRET = "sk-or-v1-vaultsecretvalueabcdefghijk";

let lastLlmKey: string | undefined;
let lastPlannerKey: string | undefined;

vi.mock("../../engineering/cad-server/llm-client", () => ({
  generateOpenScad: vi.fn(async (input: { openRouterApiKey?: string }) => {
    lastLlmKey = input.openRouterApiKey;
    return { ok: true, scad: "cube(10);" };
  }),
  repairOpenScad: vi.fn(async () => ({ ok: false })),
}));

vi.mock("../../engineering/cad-server/print3d-planner", () => ({
  planPrint3DRequest: vi.fn(async (input: { openRouterApiKey?: string }) => {
    lastPlannerKey = input.openRouterApiKey;
    return {
      ok: true,
      plan: {
        action: "generate",
        userLanguage: "en",
        intent: "mechanical",
        pipeline: "openscad",
        technicalPrompt: "bracket 40mm",
      },
    };
  }),
}));

vi.mock("../../engineering/cad-server/scad-runner", () => ({
  renderScadToStl: vi.fn(async () => ({
    ok: true,
    stlBuffer: Buffer.from("solid test\nendsolid test\n"),
  })),
  fallbackScadForPrompt: vi.fn(() => "cube(5);"),
  isOpenScadInstalled: vi.fn(async () => true),
  OPENSCAD_INSTALL_HINT_RO: "OpenSCAD mock",
}));

const sign = (accountId: string): string =>
  jwt.sign({ sub: accountId }, JWT_SECRET, { algorithm: "HS256" });

const PUBLIC_PROFILE_KEYS = [
  "id",
  "provider",
  "capabilities",
  "status",
  "createdAt",
  "updatedAt",
  "revokedAt",
];

const assertPublicProfile = (profile: Record<string, unknown>): void => {
  expect(Object.keys(profile).sort()).toEqual([...PUBLIC_PROFILE_KEYS].sort());
  expect(JSON.stringify(profile)).not.toMatch(/ciphertext|secret_iv|auth_tag|authTag|keyVersion|key_version/i);
  expect(JSON.stringify(profile)).not.toContain(VAULT_SECRET);
  expect(JSON.stringify(profile)).not.toMatch(/sk-or-v1-/);
};

describe("SEC-C2 PR1 provider profiles", () => {
  const accountA = randomUUID();
  const accountB = randomUUID();

  beforeEach(() => {
    lastLlmKey = undefined;
    lastPlannerKey = undefined;
    process.env.CAD_ALLOW_ANONYMOUS = "1";
    process.env.CAD_JWT_SECRET = JWT_SECRET;
    process.env.CAD_PROFILE_ENCRYPTION_KEY = ENC_KEY;
    process.env.CAD_PROFILE_ENCRYPTION_KEY_VERSION = "1";
    process.env.CAD_LEGACY_CLIENT_SECRET_PAYLOAD = "true";
    delete process.env.CAD_API_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    resetCadJobsForTests();
    resetCadRateLimitsForTests();
    resetJobRegistryForTests();
    resetAllJobLogsForTests();
    resetLocalArtifactsForTests();
    resetProviderProfilesForTests();
  });

  afterEach(() => {
    delete process.env.CAD_LEGACY_CLIENT_SECRET_PAYLOAD;
  });

  const createOwnProfile = async (accountId: string) => {
    const app = createCadServer();
    const created = await request(app)
      .post("/cad/profiles")
      .set("Authorization", `Bearer ${sign(accountId)}`)
      .send({ provider: "openrouter", secret: VAULT_SECRET, capabilities: ["plan", "openscad"] });
    expect(created.status).toBe(201);
    assertPublicProfile(created.body.profile);
    return { app, profileId: created.body.profile.id as string };
  };

  it("JWT + own active profile runs a job from vault without key fields in the HTTP body", async () => {
    const { app, profileId } = await createOwnProfile(accountA);
    const body = {
      prompt: "Bracket 40mm aluminum",
      providerProfileId: profileId,
    };
    expect(JSON.stringify(body)).not.toMatch(/apiKey|token|openRouterApiKey|meshApiKey/i);

    const created = await request(app)
      .post("/cad/jobs")
      .set("Authorization", `Bearer ${sign(accountA)}`)
      .set("x-caval-user-id", "spoofed-header-must-not-win")
      .send(body);
    expect(created.status).toBe(202);
    expect(created.body.jobId).toBeTruthy();
    expect(JSON.stringify(created.body)).not.toContain(VAULT_SECRET);

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(lastLlmKey).toBe(VAULT_SECRET);
  });

  it("rejects another account's profile with 403 and does not decrypt", async () => {
    const { app, profileId } = await createOwnProfile(accountA);
    const decryptSpy = vi.spyOn(profileSecret, "decryptProfileSecret");
    const foreign = await request(app)
      .post("/cad/jobs")
      .set("Authorization", `Bearer ${sign(accountB)}`)
      .send({ prompt: "Bracket 40mm aluminum", providerProfileId: profileId });
    expect(foreign.status).toBe(403);
    expect(decryptSpy).not.toHaveBeenCalled();
    decryptSpy.mockRestore();
  });

  it("rejects a revoked profile without decrypt", async () => {
    const { app, profileId } = await createOwnProfile(accountA);
    const revoked = await request(app)
      .post(`/cad/profiles/${profileId}/revoke`)
      .set("Authorization", `Bearer ${sign(accountA)}`)
      .send();
    expect(revoked.status).toBe(200);
    expect(revoked.body.profile.status).toBe("revoked");
    assertPublicProfile(revoked.body.profile);

    const decryptSpy = vi.spyOn(profileSecret, "decryptProfileSecret");
    const job = await request(app)
      .post("/cad/jobs")
      .set("Authorization", `Bearer ${sign(accountA)}`)
      .send({ prompt: "Bracket 40mm aluminum", providerProfileId: profileId });
    expect(job.status).toBe(403);
    expect(decryptSpy).not.toHaveBeenCalled();
    decryptSpy.mockRestore();
  });

  it("retries job and plan with providerProfileId and no key fields", async () => {
    const { app, profileId } = await createOwnProfile(accountA);
    const auth = { Authorization: `Bearer ${sign(accountA)}` };
    const jobBody = { prompt: "Gear 20 teeth module 2", providerProfileId: profileId };
    const planBody = {
      latestUserText: "make a 40mm bracket",
      messages: [],
      providerProfileId: profileId,
    };
    expect(JSON.stringify(jobBody)).not.toMatch(/ApiKey/);
    expect(JSON.stringify(planBody)).not.toMatch(/ApiKey/);

    const first = await request(app).post("/cad/jobs").set(auth).send(jobBody);
    const retry = await request(app).post("/cad/jobs").set(auth).send(jobBody);
    expect(first.status).toBe(202);
    expect(retry.status).toBe(202);

    const plan1 = await request(app).post("/cad/plan").set(auth).send(planBody);
    const plan2 = await request(app).post("/cad/plan").set(auth).send(planBody);
    expect(plan1.status).toBe(200);
    expect(plan2.status).toBe(200);
    expect(lastPlannerKey).toBe(VAULT_SECRET);

    const resolved = await resolveOwnedActiveProfileSecret({
      accountId: accountA,
      profileId,
    });
    const retried = applyResolvedSecretToCadInput(
      { prompt: jobBody.prompt, providerProfileId: profileId },
      resolved
    );
    expect(retried.openRouterApiKey).toBe(VAULT_SECRET);
    expect(JSON.stringify({ prompt: jobBody.prompt, providerProfileId: profileId })).not.toMatch(
      /openRouterApiKey/
    );
  });

  it("keeps legacy body keys working while the flag is on, without logging the secret", async () => {
    const app = createCadServer();
    const lines: string[] = [];
    const original = console.info;
    console.info = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      const created = await request(app)
        .post("/cad/jobs")
        .set("x-caval-user-id", "legacy_user")
        .send({
          prompt: "Phone stand angled 65 degrees",
          openRouterApiKey: VAULT_SECRET,
        });
      expect(created.status).toBe(202);
    } finally {
      console.info = original;
    }
    expect(lines.join("\n")).not.toContain(VAULT_SECRET);
    expect(lines.join("\n")).toMatch(/"requestClass":"legacy"/);
  });

  it("rejects legacy key fields when the flag is off", async () => {
    process.env.CAD_LEGACY_CLIENT_SECRET_PAYLOAD = "false";
    const app = createCadServer();
    const created = await request(app)
      .post("/cad/jobs")
      .set("x-caval-user-id", "legacy_user")
      .send({
        prompt: "Phone stand angled 65 degrees",
        openRouterApiKey: VAULT_SECRET,
      });
    expect(created.status).toBe(400);
    expect(created.body.error).toMatch(/Legacy API key fields are disabled/i);
  });

  it("blocks anonymous and header spoof from provider profiles", async () => {
    const { profileId } = await createOwnProfile(accountA);
    const app = createCadServer();

    const anonList = await request(app).get("/cad/profiles");
    expect(anonList.status).toBe(401);

    const headerCreate = await request(app)
      .post("/cad/profiles")
      .set("x-caval-user-id", accountA)
      .send({ provider: "meshy", secret: "meshy-secret-value" });
    expect(headerCreate.status).toBe(401);

    const headerJob = await request(app)
      .post("/cad/jobs")
      .set("x-caval-user-id", accountA)
      .send({ prompt: "Bracket 40mm aluminum", providerProfileId: profileId });
    expect(headerJob.status).toBe(401);
  });

  it("lists only metadata for the JWT account", async () => {
    const { app, profileId } = await createOwnProfile(accountA);
    const listed = await request(app)
      .get("/cad/profiles")
      .set("Authorization", `Bearer ${sign(accountA)}`);
    expect(listed.status).toBe(200);
    expect(listed.body.profiles).toHaveLength(1);
    expect(listed.body.profiles[0].id).toBe(profileId);
    assertPublicProfile(listed.body.profiles[0]);

    const other = await request(app)
      .get("/cad/profiles")
      .set("Authorization", `Bearer ${sign(accountB)}`);
    expect(other.body.profiles).toEqual([]);
  });
});
