-- セキュリティ監査（2026-10-09）の修正
-- 1. 顧客が自分の role / company_id を書き換えられないようにする（列単位で UPDATE を剥奪）
revoke update on profiles from authenticated;
grant update (display_name) on profiles to authenticated;

-- 2. ビューは呼び出し側の権限・RLSで評価する。anon は読めない
alter view deployments_customer set (security_invoker = true);
alter view v_divergence_progress set (security_invoker = true);
revoke select on deployments_customer from anon;
revoke select on v_divergence_progress from anon;

-- 3. sheet_rows は顧客から物理削除できない。questions は顧客は作成・閲覧のみ。homeworks は回答列だけ更新可
drop policy if exists cu_rows on sheet_rows;
create policy cu_rows_sel on sheet_rows for select using (company_id = current_company_id());
create policy cu_rows_ins on sheet_rows for insert with check (company_id = current_company_id());
create policy cu_rows_upd on sheet_rows for update using (company_id = current_company_id()) with check (company_id = current_company_id());

drop policy if exists cu_q on questions_to_operator;
create policy cu_q_sel on questions_to_operator for select using (company_id = current_company_id());
create policy cu_q_ins on questions_to_operator for insert with check (company_id = current_company_id());

drop policy if exists cu_hw on homeworks;
create policy cu_hw_sel on homeworks for select using (company_id = current_company_id());
create policy cu_hw_upd on homeworks for update using (company_id = current_company_id()) with check (company_id = current_company_id());

-- 4. 顧客は deployments の手法列を読めない（operator は service role 経由で読む）
revoke select (techniques_json) on deployments from authenticated;

-- 5. 顧客は自社の activity_log を読める（AIエラーの表示に必要）
create policy cu_log_sel on activity_log for select using (company_id = current_company_id());

-- 6. 補助関数は anon から呼べない。search_path 固定
revoke execute on function current_company_id() from anon;
revoke execute on function is_operator() from anon;
alter function set_updated_at() set search_path = public;
