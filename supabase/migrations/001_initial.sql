-- Caval Studio Supabase initial schema

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  caval_id text unique not null,
  email text unique not null,
  display_name text,
  plan text not null default 'community',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  product_id text,
  status text not null default 'unknown',
  entitlements jsonb not null default '[]'::jsonb,
  expires_at timestamptz,
  revenuecat_app_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_subscriptions_status on public.subscriptions(status);
create index if not exists idx_billing_events_user_id on public.billing_events(user_id);
create index if not exists idx_billing_events_created_at on public.billing_events(created_at desc);
