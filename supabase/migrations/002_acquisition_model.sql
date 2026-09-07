-- Industry-neutral acquisition model.
-- The first migration contains the radar primitives; this migration adds the
-- offer, campaign, evidence, experiment, exclusion, and business-result layer.

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  problem_solved text not null default '',
  deliverables jsonb not null default '[]'::jsonb,
  buyer_types text[] not null default '{}',
  proof jsonb not null default '[]'::jsonb,
  allowed_claims text[] not null default '{}',
  excluded_claims text[] not null default '{}',
  next_step text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete set null,
  profile_id uuid references public.business_profiles(id) on delete set null,
  name text not null,
  market_lang text not null default 'en-CA',
  city text,
  country text,
  categories text[] not null default '{}',
  hypothesis text not null default '',
  primary_ask text not null default '',
  sender_name text not null default '',
  status text not null default 'draft' check (status in ('draft', 'ready', 'running', 'paused', 'complete', 'archived')),
  daily_limit integer check (daily_limit is null or daily_limit > 0),
  budget_cents integer check (budget_cents is null or budget_cents >= 0),
  starts_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete cascade,
  kind text not null check (kind in ('evidence', 'hypothesis', 'unknown', 'next_step')),
  claim text not null,
  source_url text,
  source_quote text,
  source_type text,
  observed_at timestamptz,
  confidence numeric check (confidence is null or confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create table if not exists public.exclusions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in ('domain', 'email', 'phone', 'company', 'source_id')),
  value text not null,
  reason text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, kind, value)
);

create table if not exists public.campaign_experiments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  dimension text not null check (dimension in ('audience', 'offer', 'ask', 'message')),
  variant text not null,
  hypothesis text not null default '',
  status text not null default 'draft' check (status in ('draft', 'running', 'paused', 'complete')),
  created_at timestamptz not null default now()
);

create table if not exists public.business_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  prospect_id uuid references public.prospects(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  kind text not null check (kind in ('sent', 'reply', 'qualified_interest', 'meeting', 'proposal', 'paid_order', 'repeat_order', 'lost')),
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  currency text,
  note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists offers_tenant_status_idx on public.offers(tenant_id, status);
create index if not exists campaigns_tenant_status_idx on public.campaigns(tenant_id, status);
create index if not exists evidence_campaign_prospect_idx on public.campaign_evidence(campaign_id, prospect_id);
create index if not exists exclusions_tenant_active_idx on public.exclusions(tenant_id, active);
create index if not exists business_events_campaign_kind_idx on public.business_events(campaign_id, kind);

alter table public.offers enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_evidence enable row level security;
alter table public.exclusions enable row level security;
alter table public.campaign_experiments enable row level security;
alter table public.business_events enable row level security;

create policy offer_isolation on public.offers for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy campaign_isolation on public.campaigns for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy evidence_isolation on public.campaign_evidence for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy exclusion_isolation on public.exclusions for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy experiment_isolation on public.campaign_experiments for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy business_event_isolation on public.business_events for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
