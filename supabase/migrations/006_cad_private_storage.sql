-- Harden existing CAD deployments: private bucket, drop public STL URLs, add columns

alter table public.cad_generations
  add column if not exists mesh_task_id text,
  add column if not exists expires_at timestamptz;

alter table public.cad_generations
  drop column if exists stl_url;

update storage.buckets set public = false where id = 'cad-models';

drop policy if exists "cad_models_public_read" on storage.objects;

create policy if not exists "cad_models_service_read"
  on storage.objects for select
  using (bucket_id = 'cad-models' and auth.role() = 'service_role');
