alter table public.users
  add column if not exists platform_admin boolean not null default false;

update public.users
set platform_admin = true
where role = 'owner';
