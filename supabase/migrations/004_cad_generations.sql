-- Text-to-CAD job history and private artifact storage

create table if not exists public.cad_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  caval_id text,
  prompt text not null,
  project_type text,
  constraints jsonb not null default '{}'::jsonb,
  generation_mode text not null default 'openscad',
  generated_scad text,
  status text not null default 'queued',
  error_message text,
  stl_path text,
  mesh_task_id text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cad_generations_caval_id on public.cad_generations(caval_id);
create index if not exists idx_cad_generations_status on public.cad_generations(status);
create index if not exists idx_cad_generations_created_at on public.cad_generations(created_at desc);
create index if not exists idx_cad_generations_expires_at on public.cad_generations(expires_at);

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

-- Private storage bucket for STL artifacts (signed URLs only)
insert into storage.buckets (id, name, public)
values ('cad-models', 'cad-models', false)
on conflict (id) do update set public = false;

drop policy if exists "cad_models_public_read" on storage.objects;

create policy "cad_models_service_read"
  on storage.objects for select
  using (bucket_id = 'cad-models' and auth.role() = 'service_role');

create policy "cad_models_service_write"
  on storage.objects for insert
  with check (bucket_id = 'cad-models' and auth.role() = 'service_role');

create policy "cad_models_service_update"
  on storage.objects for update
  using (bucket_id = 'cad-models' and auth.role() = 'service_role');

create policy "cad_models_service_delete"
  on storage.objects for delete
  using (bucket_id = 'cad-models' and auth.role() = 'service_role');
