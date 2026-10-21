-- 契約前・編集終了・解約の会社は、DBの段階でも書き込めないようにする（画面・サーバ処理だけでなく、APIを直接呼ばれても止める）。
-- 読むことはこれまでどおりできる。ベレネッツ（operator）の権限は op_* のポリシーで別にあるので影響しない。

create or replace function company_writable() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from companies c
    where c.id = current_company_id()
      and c.status not in ('diagnosed', 'locked', 'cancelled')
  )
$$;
revoke all on function company_writable() from public, anon;
grant execute on function company_writable() to authenticated;

-- sheet_rows（削除はもともと不可）
drop policy if exists cu_rows_ins on sheet_rows;
create policy cu_rows_ins on sheet_rows for insert with check (company_id = current_company_id() and company_writable());
drop policy if exists cu_rows_upd on sheet_rows;
create policy cu_rows_upd on sheet_rows for update
  using (company_id = current_company_id() and company_writable())
  with check (company_id = current_company_id() and company_writable());

-- 宿題（答えるだけ）
drop policy if exists cu_hw_upd on homeworks;
create policy cu_hw_upd on homeworks for update
  using (company_id = current_company_id() and company_writable())
  with check (company_id = current_company_id() and company_writable());

-- 会社単位の表：読む／書く を分ける
do $$
declare t text; p text;
begin
  for t, p in select * from (values
      ('company_documents', 'cu_documents'),
      ('company_profile_summary', 'cu_summary'),
      ('competitors', 'cu_competitors'),
      ('profile_items', 'cu_profile_items')
  ) as v(t, p) loop
    execute format('drop policy if exists %I on %I', p, t);
    execute format('create policy %I on %I for select using (company_id = current_company_id())', p || '_sel', t);
    execute format('create policy %I on %I for insert with check (company_id = current_company_id() and company_writable())', p || '_ins', t);
    execute format('create policy %I on %I for update using (company_id = current_company_id() and company_writable()) with check (company_id = current_company_id() and company_writable())', p || '_upd', t);
    execute format('create policy %I on %I for delete using (company_id = current_company_id() and company_writable())', p || '_del', t);
  end loop;
end $$;

-- 組（sheet_rows）にぶら下がる表：読む／書く を分ける
do $$
declare t text; p text; q text;
begin
  for t, p in select * from (values
      ('brakes', 'cu_brakes'),
      ('competitor_comparisons', 'cu_cc'),
      ('evidences', 'cu_evidences'),
      ('litmus_niche', 'cu_ln'),
      ('member_notes', 'cu_notes'),
      ('row_diagnoses', 'cu_row_diagnoses')
  ) as v(t, p) loop
    q := format('exists (select 1 from sheet_rows r where r.id = %I.row_id and r.company_id = current_company_id())', t);
    execute format('drop policy if exists %I on %I', p, t);
    execute format('create policy %I on %I for select using (%s)', p || '_sel', t, q);
    execute format('create policy %I on %I for insert with check (%s and company_writable())', p || '_ins', t, q);
    execute format('create policy %I on %I for update using (%s and company_writable()) with check (%s and company_writable())', p || '_upd', t, q, q);
    execute format('create policy %I on %I for delete using (%s and company_writable())', p || '_del', t, q);
  end loop;
end $$;

-- 市場の試験紙：お客様はベレネッツの採点を書き換えられない（元の条件を保ったまま分ける）
drop policy if exists cu_lm on litmus_market;
create policy cu_lm_sel on litmus_market for select
  using (exists (select 1 from sheet_rows r where r.id = litmus_market.row_id and r.company_id = current_company_id()));
create policy cu_lm_ins on litmus_market for insert
  with check (exists (select 1 from sheet_rows r where r.id = litmus_market.row_id and r.company_id = current_company_id())
              and scored_by = 'customer'::author_kind and company_writable());
create policy cu_lm_upd on litmus_market for update
  using (exists (select 1 from sheet_rows r where r.id = litmus_market.row_id and r.company_id = current_company_id())
         and scored_by <> 'operator'::author_kind and company_writable())
  with check (exists (select 1 from sheet_rows r where r.id = litmus_market.row_id and r.company_id = current_company_id())
              and scored_by = 'customer'::author_kind and company_writable());
create policy cu_lm_del on litmus_market for delete
  using (exists (select 1 from sheet_rows r where r.id = litmus_market.row_id and r.company_id = current_company_id())
         and scored_by <> 'operator'::author_kind and company_writable());
