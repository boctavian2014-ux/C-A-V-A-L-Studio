-- Row Level Security policies

alter table public.users enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;

create policy "users_select_own"
  on public.users for select
  using (auth.uid()::text = id::text or auth.jwt() ->> 'caval_id' = caval_id);

-- users UPDATE removed: plan must not be client-writable (see 005_users_plan_rls_fix.sql).

create policy "subscriptions_select_own"
  on public.subscriptions for select
  using (
    exists (
      select 1 from public.users u
      where u.id = subscriptions.user_id
        and (auth.uid()::text = u.id::text or auth.jwt() ->> 'caval_id' = u.caval_id)
    )
  );

create policy "billing_events_select_own"
  on public.billing_events for select
  using (
    user_id is null or exists (
      select 1 from public.users u
      where u.id = billing_events.user_id
        and (auth.uid()::text = u.id::text or auth.jwt() ->> 'caval_id' = u.caval_id)
    )
  );

-- Service role only for writes from backend webhooks
create policy "billing_events_service_insert"
  on public.billing_events for insert
  with check (auth.role() = 'service_role');

create policy "subscriptions_service_write"
  on public.subscriptions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
