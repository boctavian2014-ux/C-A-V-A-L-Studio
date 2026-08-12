import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("007_provider_profiles migration", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/007_provider_profiles.sql"),
    "utf8"
  );

  it("creates ciphertext columns and forbids plaintext secret storage", () => {
    expect(sql).toMatch(/create table if not exists public\.provider_profiles/i);
    expect(sql).toMatch(/secret_ciphertext text not null/i);
    expect(sql).toMatch(/secret_iv text not null/i);
    expect(sql).toMatch(/secret_auth_tag text not null/i);
    expect(sql).toMatch(/key_version integer not null/i);
    expect(sql).toMatch(/account_id uuid not null/i);
    expect(sql).toMatch(/idx_provider_profiles_account_status/);
    expect(sql).toMatch(/idx_provider_profiles_one_active_per_provider/);
    expect(sql).not.toMatch(/api_key text/i);
    expect(sql).not.toMatch(/plaintext/i);
  });

  it("enables RLS, revokes Data API access to ciphertext, and scopes select to own metadata", () => {
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/revoke all on public\.provider_profiles from anon, authenticated, public/i);
    expect(sql).toMatch(/grant select \(/i);
    expect(sql).not.toMatch(/grant select \([^)]*secret_ciphertext/i);
    expect(sql).toMatch(/auth\.uid\(\) = account_id/);
    expect(sql).toMatch(/to service_role/);
  });
});
