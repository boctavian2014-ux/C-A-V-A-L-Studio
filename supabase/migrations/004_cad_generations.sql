-- Text-to-CAD job history and artifacts metadata

create table if not exists public.cad_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  caval_id text,
  prompt text not null,
  project_type text,
  constraints jsonb not null default '{}'::jsonb,
  generated_scad text,
  status text not null default 'queued',
  error_message text,
  stl_path text,
  stl_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cad_generations_caval_id on public.cad_generations(caval_id);
create index if not exists idx_cad_generations_status on public.cad_generations(status);
create index if not exists idx_cad_generations_created_at on public.cad_generations(created_at desc);

alter table public.cad_generations enable row level security;

create policy "cad_generations_select_own"
  on public.cad_generations for select
  using (
    caval_id is not null
    and auth.jwt() ->> 'caval_id' = caval_id
  );

create policy "cad_generations_service_all"
  on public.cad_generations for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Storage bucket for STL artifacts (create via Supabase dashboard or storage API)
insert into storage.buckets (id, name, public)
values ('cad-models', 'cad-models', true)
on conflict (id) do update set public = true;

create policy "cad_models_public_read"
  on storage.objects for select
  using (bucket_id = 'cad-models');

create policy "cad_models_service_write"
  on storage.objects for insert
  with check (bucket_id = 'cad-models' and auth.role() = 'service_role');

create policy "cad_models_service_update"
  on storage.objects for update
  using (bucket_id = 'cad-models' and auth.role() = 'service_role');

create policy "cad_models_service_delete"
  on storage.objects for delete
  using (bucket_id = 'cad-models' and auth.role() = 'service_role');
