-- 確認セッション③のあと1か月の猶予期間（grace）は、シートの閲覧と Excel ダウンロードだけ（仕様 00）。
-- シートの表（sheet_rows・brakes・profile_items など、company_writable() を使う表）をお客様のロールから書けないようにする。
-- 質問・エラーレポート・担当者別メモなど、company_writable() を使っていない表は変わらない。
create or replace function company_writable() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from companies c
    where c.id = current_company_id()
      and c.status not in ('diagnosed', 'grace', 'locked', 'cancelled')
  )
$$;
revoke all on function company_writable() from public, anon;
grant execute on function company_writable() to authenticated;
