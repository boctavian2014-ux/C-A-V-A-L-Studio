-- Optional generation mode for CAD jobs (openscad vs mesh)

alter table public.cad_generations
  add column if not exists generation_mode text default 'openscad';

create index if not exists idx_cad_generations_generation_mode
  on public.cad_generations(generation_mode);
