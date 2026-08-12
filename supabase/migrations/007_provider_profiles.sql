-- Per-account CAD provider profiles. Ciphertext is never exposed via Data API.

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'cad_provider' and n.nspname = 'public'
  ) then
    create type public.cad_provider as enum ('openrouter', 'meshy', 'piapi');
  end if;
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'cad_provider_profile_status' and n.nspname = 'public'
  ) then
    create type public.cad_provider_profile_status as enum ('active', 'revoked');
  end if;
end
$$;

create table if not exists public.provider_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  provider public.cad_provider not null,
  capabilities jsonb not null default '[]'::jsonb,
  secret_ciphertext text not null,
  secret_iv text not null,
  secret_auth_tag text not null,
  key_version integer not null,
  status public.cad_provider_profile_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists idx_provider_profiles_account_status
  on public.provider_profiles (account_id, status);

create unique index if not exists idx_provider_profiles_one_active_per_provider
  on public.provider_profiles (account_id, provider)
  where status = 'active';

alter table public.provider_profiles enable row level security;

revoke all on public.provider_profiles from anon, authenticated, public;

grant select (
  id,
  account_id,
  provider,
  capabilities,
  status,
  created_at,
  updated_at,
  revoked_at
) on public.provider_profiles to authenticated;

create policy "provider_profiles_select_own_metadata"
  on public.provider_profiles
  for select
  to authenticated
  using (auth.uid() = account_id);

create policy "provider_profiles_service_all"
  on public.provider_profiles
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.provider_profiles is
  'CAD BYOK provider profiles. secret_* columns are ciphertext only; CAD server decrypts in memory.';
comment on column public.provider_profiles.secret_ciphertext is 'AES-256-GCM ciphertext (base64). Never return via API.';
comment on column public.provider_profiles.secret_iv is '12-byte GCM nonce (base64). Never return via API.';
comment on column public.provider_profiles.secret_auth_tag is 'GCM auth tag (base64). Never return via API.';
