-- RLS helper functions must be security definer to avoid recursive policy evaluation on profiles
create or replace function current_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from profiles where id = auth.uid()
$$;
create or replace function is_operator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'operator')
$$;
revoke all on function current_company_id() from public;
revoke all on function is_operator() from public;
grant execute on function current_company_id() to authenticated, anon, service_role;
grant execute on function is_operator() to authenticated, anon, service_role;
