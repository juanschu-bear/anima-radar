-- Store the account holder's display identity separately from auth metadata.
-- The column stays nullable so existing users can be migrated without downtime.
alter table public.users
  add column if not exists full_name text;

-- Three-argument bootstrap used by the web onboarding flow.
create or replace function public.bootstrap_tenant(
  p_name text,
  p_default_market_lang text,
  p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant_id uuid;
  normalized_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  normalized_name := nullif(trim(p_name), '');
  if normalized_name is null then
    raise exception 'Workspace name is required';
  end if;

  insert into public.tenants (name, default_market_lang)
  values (normalized_name, p_default_market_lang)
  returning id into new_tenant_id;

  insert into public.users (id, tenant_id, email, full_name, role)
  values (
    auth.uid(),
    new_tenant_id,
    coalesce(auth.jwt() ->> 'email', ''),
    nullif(trim(p_full_name), ''),
    'owner'
  );

  return new_tenant_id;
end;
$$;

revoke all on function public.bootstrap_tenant(text, text, text) from public;
grant execute on function public.bootstrap_tenant(text, text, text) to authenticated;
