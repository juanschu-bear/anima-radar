update public.users
set platform_admin = true
where role = 'owner'
  and platform_admin = false;

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

  insert into public.users (id, tenant_id, email, full_name, role, platform_admin)
  values (
    auth.uid(),
    new_tenant_id,
    coalesce(auth.jwt() ->> 'email', ''),
    nullif(trim(p_full_name), ''),
    'owner',
    true
  );

  return new_tenant_id;
end;
$$;
