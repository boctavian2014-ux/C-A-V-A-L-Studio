import { getSupabaseAdmin, isSupabaseConfigured } from "./client";
import type { BillingEventInsert, SubscriptionRecord, SubscriptionStatus } from "../types";
import {
  getSubscription as getMemorySubscription,
  listSubscriptions as listMemorySubscriptions,
  updateSubscriptionMemory,
} from "../subscription-store";

export interface StripeUserUpsert {
  cavalId: string;
  email: string;
  stripeCustomerId: string;
  displayName?: string;
}

export interface StripeSubscriptionUpsert {
  userId: string;
  cavalId?: string;
  email?: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId?: string;
  productId?: string;
  status: SubscriptionStatus;
  plan: string;
  entitlements: string[];
  expiresAt?: string;
}

const statusToPlan = (status: SubscriptionStatus): string =>
  status === "active" || status === "trial" ? "pro" : "community";

export const upsertUserFromStripe = async (input: StripeUserUpsert): Promise<string> => {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase not configured");

  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .or(`caval_id.eq.${input.cavalId},stripe_customer_id.eq.${input.stripeCustomerId}`)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("users")
      .update({
        email: input.email,
        stripe_customer_id: input.stripeCustomerId,
        display_name: input.displayName ?? input.email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("users")
    .insert({
      caval_id: input.cavalId,
      email: input.email,
      stripe_customer_id: input.stripeCustomerId,
      display_name: input.displayName ?? input.email,
      plan: "community",
    })
    .select("id")
    .single();

  if (error || !data?.id) throw new Error(error?.message ?? "Failed to create user");
  return data.id as string;
};

export const upsertSubscriptionFromStripe = async (
  input: StripeSubscriptionUpsert
): Promise<SubscriptionRecord> => {
  const record: SubscriptionRecord = {
    userId: input.cavalId ?? input.userId,
    productId: input.productId,
    entitlements: input.entitlements,
    status: input.status,
    plan: input.plan,
    expiresAt: input.expiresAt,
    updatedAt: new Date().toISOString(),
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    stripePriceId: input.stripePriceId,
    email: input.email,
  };

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return updateSubscriptionMemory(record);
  }

  let userUuid = input.userId;
  if (!userUuid || userUuid === input.cavalId) {
    userUuid = await upsertUserFromStripe({
      cavalId: input.cavalId ?? input.userId,
      email: input.email ?? `${input.cavalId}@caval.local`,
      stripeCustomerId: input.stripeCustomerId,
    });
  }

  const { error: subError } = await supabase.from("subscriptions").upsert(
    {
      user_id: userUuid,
      product_id: input.productId,
      status: input.status,
      entitlements: input.entitlements,
      expires_at: input.expiresAt ?? null,
      stripe_customer_id: input.stripeCustomerId,
      stripe_subscription_id: input.stripeSubscriptionId,
      stripe_price_id: input.stripePriceId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" }
  );

  if (subError) throw new Error(subError.message);

  const userPlan = input.status === "active" || input.status === "trial" ? "pro" : "community";
  await supabase
    .from("users")
    .update({ plan: userPlan, updated_at: new Date().toISOString() })
    .eq("id", userUuid);

  return record;
};

export const insertBillingEvent = async (event: BillingEventInsert): Promise<boolean> => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const { error } = await supabase.from("billing_events").insert({
    external_event_id: event.externalEventId,
    user_id: event.userId ?? null,
    event_type: event.eventType,
    provider: event.provider,
    payload: event.payload,
  });

  if (error?.code === "23505") return false;
  if (error) throw new Error(error.message);
  return true;
};

export const getSubscriptionByCavalId = async (cavalId: string): Promise<SubscriptionRecord | null> => {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return getMemorySubscription(cavalId) ?? null;
  }

  const { data: user } = await supabase
    .from("users")
    .select("id, caval_id, email, plan, stripe_customer_id")
    .eq("caval_id", cavalId)
    .maybeSingle();

  if (!user) return null;

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub) {
    return {
      userId: cavalId,
      entitlements: [],
      status: "unknown",
      plan: (user.plan as string) ?? "community",
      updatedAt: new Date().toISOString(),
      stripeCustomerId: user.stripe_customer_id ?? undefined,
      email: user.email ?? undefined,
    };
  }

  const entitlements = Array.isArray(sub.entitlements) ? (sub.entitlements as string[]) : [];
  return {
    userId: cavalId,
    productId: sub.product_id ?? undefined,
    entitlements,
    status: (sub.status as SubscriptionStatus) ?? "unknown",
      plan: (user.plan as string) ?? statusToPlan(sub.status as SubscriptionStatus),
    expiresAt: sub.expires_at ?? undefined,
    updatedAt: sub.updated_at ?? new Date().toISOString(),
    stripeCustomerId: sub.stripe_customer_id ?? undefined,
    stripeSubscriptionId: sub.stripe_subscription_id ?? undefined,
    stripePriceId: sub.stripe_price_id ?? undefined,
    email: user.email ?? undefined,
  };
};

export const listSubscriptionsFromDb = async (limit = 100): Promise<SubscriptionRecord[]> => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return listMemorySubscriptions();

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*, users(caval_id, email, plan)")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const user = row.users as { caval_id?: string; email?: string; plan?: string } | null;
    const entitlements = Array.isArray(row.entitlements) ? (row.entitlements as string[]) : [];
    return {
      userId: user?.caval_id ?? String(row.user_id),
      productId: row.product_id ?? undefined,
      entitlements,
      status: (row.status as SubscriptionStatus) ?? "unknown",
      plan: user?.plan ?? "community",
      expiresAt: row.expires_at ?? undefined,
      updatedAt: row.updated_at ?? new Date().toISOString(),
      stripeCustomerId: row.stripe_customer_id ?? undefined,
      stripeSubscriptionId: row.stripe_subscription_id ?? undefined,
      stripePriceId: row.stripe_price_id ?? undefined,
      email: user?.email ?? undefined,
    };
  });
};

export const countSubscriptions = async (): Promise<number> => {
  if (!isSupabaseConfigured()) return listMemorySubscriptions().length;
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("subscriptions")
    .select("*", { count: "exact", head: true });
  if (error) return 0;
  return count ?? 0;
};
