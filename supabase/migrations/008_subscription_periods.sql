-- Revolut manual payment-link subscription periods + usage metering scaffold.
-- PR1 foundation: schema only. model_usage is declared and defaults to [].
-- Population / entitlement enforcement lands in a later PR.

alter table public.subscriptions
  add column if not exists plan_id text,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists billing_mode text,
  add column if not exists revolut_payment_reference text;

-- Unique Revolut payment reference when present (manual activation tracking).
create unique index if not exists idx_subscriptions_revolut_payment_reference
  on public.subscriptions (revolut_payment_reference)
  where revolut_payment_reference is not null;

create index if not exists idx_subscriptions_period_end
  on public.subscriptions (current_period_end);

-- Per-user period usage. model_usage is an empty array until metering PR.
create table if not exists public.usage_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  requests_used integer not null default 0,
  cad_jobs_used integer not null default 0,
  zoo_cost_accrued numeric(12, 6) not null default 0,
  chat_tokens_used integer not null default 0,
  model_usage jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period_start)
);

create index if not exists idx_usage_records_user_id on public.usage_records(user_id);
create index if not exists idx_usage_records_period on public.usage_records(period_start, period_end);

alter table public.usage_records enable row level security;

drop policy if exists "usage_records_select_own" on public.usage_records;
create policy "usage_records_select_own"
  on public.usage_records for select
  using (
    exists (
      select 1 from public.users u
      where u.id = usage_records.user_id
        and (auth.uid()::text = u.id::text or auth.jwt() ->> 'caval_id' = u.caval_id)
    )
  );

drop policy if exists "usage_records_service_all" on public.usage_records;
create policy "usage_records_service_all"
  on public.usage_records for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
