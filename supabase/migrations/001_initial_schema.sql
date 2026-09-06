create extension if not exists pgcrypto;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(), name text not null,
  default_market_lang text not null default 'en-CA', created_at timestamptz not null default now()
);
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade, tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null, role text not null default 'member' check (role in ('owner','member'))
);
create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  raw_answers jsonb not null default '{}'::jsonb, icp jsonb, version integer not null default 1, created_at timestamptz not null default now()
);
create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid references public.business_profiles(id) on delete set null, city text not null, country text not null,
  lat double precision, lng double precision, radius_m integer not null, categories text[] not null default '{}', sources text[] not null default '{}',
  status text not null default 'queued' check (status in ('queued','discovering','enriching','scoring','drafting','done','failed')),
  counts jsonb not null default '{"found":0,"unique":0,"enriched":0,"scored":0,"drafted":0}'::jsonb,
  started_at timestamptz, finished_at timestamptz, error text
);
create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  scan_id uuid not null references public.scans(id) on delete cascade, source text not null, source_id text not null,
  name text not null, category text, address text, city text, country text, lat double precision, lng double precision,
  website text, phone text, email text, instagram text, rating numeric, review_count integer, raw jsonb not null default '{}'::jsonb,
  enrichment jsonb not null default '{}'::jsonb, score integer check (score between 0 and 100), score_reasons jsonb not null default '[]'::jsonb,
  disqualified boolean not null default false, best_channel text, status text not null default 'new' check (status in ('new','approved','discarded','sent','replied','converted','lost')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (tenant_id, source, source_id)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade, step integer not null check (step between 1 and 3), lang text not null,
  channel text not null, subject text, body text not null, generated_body text not null, edited boolean not null default false,
  due_at timestamptz, sent_at timestamptz, created_at timestamptz not null default now(), unique (prospect_id, step)
);
create table if not exists public.outcomes (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade, kind text not null check (kind in ('replied_positive','replied_negative','no_reply','meeting','order','lost')),
  note text, created_at timestamptz not null default now()
);
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null check (type in ('discover','enrich','score','draft','learn')), payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','done','failed')), attempts integer not null default 0,
  run_after timestamptz not null default now(), locked_at timestamptz, error text, created_at timestamptz not null default now()
);
create index if not exists scans_tenant_status_idx on public.scans(tenant_id, status);
create index if not exists prospects_tenant_scan_idx on public.prospects(tenant_id, scan_id);
create index if not exists prospects_tenant_status_idx on public.prospects(tenant_id, status);
create index if not exists jobs_status_run_after_idx on public.jobs(status, run_after);

alter table public.tenants enable row level security;
alter table public.users enable row level security;
alter table public.business_profiles enable row level security;
alter table public.scans enable row level security;
alter table public.prospects enable row level security;
alter table public.messages enable row level security;
alter table public.outcomes enable row level security;
alter table public.jobs enable row level security;

create or replace function public.current_tenant_id() returns uuid language sql stable security definer set search_path = public as $$ select tenant_id from public.users where id = auth.uid() $$;

create or replace function public.bootstrap_tenant(p_name text, p_default_market_lang text default 'en-CA')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  insert into public.tenants (name, default_market_lang)
  values (trim(p_name), p_default_market_lang)
  returning id into new_tenant_id;
  insert into public.users (id, tenant_id, email, role)
  values (auth.uid(), new_tenant_id, coalesce(auth.jwt() ->> 'email', ''), 'owner');
  return new_tenant_id;
end;
$$;

revoke all on function public.bootstrap_tenant(text, text) from public;
grant execute on function public.bootstrap_tenant(text, text) to authenticated;

create policy tenant_isolation on public.tenants for all using (id = public.current_tenant_id());
create policy users_isolation on public.users for all using (tenant_id = public.current_tenant_id());
create policy profile_isolation on public.business_profiles for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy scan_isolation on public.scans for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy prospect_isolation on public.prospects for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy message_isolation on public.messages for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy outcome_isolation on public.outcomes for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy job_isolation on public.jobs for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
