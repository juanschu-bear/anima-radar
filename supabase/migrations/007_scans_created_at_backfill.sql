alter table public.scans
add column if not exists created_at timestamptz;

update public.scans
set created_at = coalesce(created_at, started_at, finished_at, now())
where created_at is null;

alter table public.scans
alter column created_at set default now();

alter table public.scans
alter column created_at set not null;
