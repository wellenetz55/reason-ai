-- 解約した会社は、ベレネッツが再アクセスを許可した期間（companies.reaccess_until）のほかは、データを一切読めない・書けない。
-- お客様向けの RLS はすべて current_company_id() で会社を絞っているので、ここで解約中は「会社なし（null）」を返す。
-- （自分の profiles 行は id = auth.uid() で読めるので、サインインと「閲覧の再開を依頼する」画面は動く）
create or replace function current_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.company_id
  from profiles p
  join companies c on c.id = p.company_id
  where p.id = auth.uid()
    and p.disabled_at is null
    and (c.status <> 'cancelled' or (c.reaccess_until is not null and c.reaccess_until > now()))
$$;
-- 権限は 0002 のまま（create or replace は既存の権限を保つ）
