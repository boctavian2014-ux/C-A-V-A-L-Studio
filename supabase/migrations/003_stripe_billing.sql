-- Stripe billing columns + idempotency + RLS fixes

alter table public.users
  add column if not exists stripe_customer_id text unique;

alter table public.subscriptions
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text unique,
  add column if not exists stripe_price_id text;

alter table public.billing_events
  add column if not exists provider text not null default 'stripe',
  add column if not exists external_event_id text unique;

create index if not exists idx_users_stripe_customer on public.users(stripe_customer_id);
create index if not exists idx_subscriptions_stripe_customer on public.subscriptions(stripe_customer_id);
create index if not exists idx_subscriptions_stripe_subscription on public.subscriptions(stripe_subscription_id);
create index if not exists idx_billing_events_external_id on public.billing_events(external_event_id);

-- Fix RLS leak: remove orphan events visible to all users
drop policy if exists "billing_events_select_own" on public.billing_events;
create policy "billing_events_select_own"
  on public.billing_events for select
  using (
    exists (
      select 1 from public.users u
      where u.id = billing_events.user_id
        and (auth.uid()::text = u.id::text or auth.jwt() ->> 'caval_id' = u.caval_id)
    )
  );

-- Service role upsert users from Stripe webhooks
create policy "users_service_upsert"
  on public.users for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
