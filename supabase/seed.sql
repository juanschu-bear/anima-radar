-- Local development seed. Production tenants should be created through the
-- bootstrap_tenant() function after the owner's magic-link login.
insert into public.tenants (name, default_market_lang)
values
  ('Andes Bloom', 'en-CA'),
  ('Florum', 'ru')
on conflict do nothing;
