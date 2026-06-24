import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("supabase RLS migrations", () => {
  const rlsPath = path.join(process.cwd(), "supabase", "migrations", "002_rls_policies.sql");
  const schemaPath = path.join(process.cwd(), "supabase", "migrations", "001_initial.sql");

  it("enables RLS on billing-related tables", () => {
    const sql = readFileSync(rlsPath, "utf8");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("subscriptions_select_own");
    expect(sql).toContain("billing_events_service_insert");
  });

  it("defines subscriptions and billing_events tables", () => {
    const sql = readFileSync(schemaPath, "utf8");
    expect(sql).toContain("create table if not exists public.subscriptions");
    expect(sql).toContain("create table if not exists public.billing_events");
    expect(sql).toContain("idx_subscriptions_user_id");
  });
});
