-- 0022 会社データのリセット（テストで入れた情報を消して、会社を最初の状態に戻す）
-- 管理画面の「この会社のデータをリセット」（スーパー管理者だけ・確認画面あり）から、サーバー側（service role）でだけ呼ぶ。
-- 1回のトランザクションで消すので、途中で失敗したら何も消えない。消す前の控えはアプリ側で backups バケットに保存する。
-- 会社そのもの・会社名・担当者（サインインできる人）は消さない。
--
-- p_parts に入れたものだけ消す：
--   sheet         提供価値シート（行と、行にひもづく診断・裏づけ・リトマス・メモ・レビュー履歴）、展開、競合、ロック、AI生成回数
--   materials     STEP 0 の資料（アップロード・URL）、会社プロフィール（AIの要約・項目）
--   communication 宿題、質問、エラーレポート、面談、アラート、操作記録、開示要求
--   diagnosis     適合診断の記録・書き起こし、適合診断の結果
--   status        状態を「診断済み（契約前）」に戻し、申込・契約・入金・各期限の日付を空にする

create or replace function public.reset_company(p_company uuid, p_parts text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n jsonb := '{}'::jsonb;
  c int;
begin
  if not exists (select 1 from companies where id = p_company) then
    raise exception 'company not found';
  end if;

  if 'sheet' = any(p_parts) then
    delete from deployments where company_id = p_company;            get diagnostics c = row_count; n := n || jsonb_build_object('deployments', c);
    delete from activation_packages where company_id = p_company;    get diagnostics c = row_count; n := n || jsonb_build_object('activation_packages', c);
    delete from sheet_locks where company_id = p_company;            get diagnostics c = row_count; n := n || jsonb_build_object('sheet_locks', c);
    delete from sheet_rows where company_id = p_company;             get diagnostics c = row_count; n := n || jsonb_build_object('sheet_rows', c);
    delete from competitors where company_id = p_company;            get diagnostics c = row_count; n := n || jsonb_build_object('competitors', c);
    delete from generation_counters where company_id = p_company;    get diagnostics c = row_count; n := n || jsonb_build_object('generation_counters', c);
  end if;

  if 'materials' = any(p_parts) then
    delete from company_documents where company_id = p_company;      get diagnostics c = row_count; n := n || jsonb_build_object('company_documents', c);
    delete from profile_items where company_id = p_company;          get diagnostics c = row_count; n := n || jsonb_build_object('profile_items', c);
    delete from company_profile_summary where company_id = p_company; get diagnostics c = row_count; n := n || jsonb_build_object('company_profile_summary', c);
  end if;

  if 'communication' = any(p_parts) then
    delete from homeworks where company_id = p_company;              get diagnostics c = row_count; n := n || jsonb_build_object('homeworks', c);
    delete from questions_to_operator where company_id = p_company;  get diagnostics c = row_count; n := n || jsonb_build_object('questions_to_operator', c);
    delete from error_reports where company_id = p_company;          get diagnostics c = row_count; n := n || jsonb_build_object('error_reports', c);
    delete from company_meetings where company_id = p_company;       get diagnostics c = row_count; n := n || jsonb_build_object('company_meetings', c);
    delete from alerts where company_id = p_company;                 get diagnostics c = row_count; n := n || jsonb_build_object('alerts', c);
    delete from activity_log where company_id = p_company;           get diagnostics c = row_count; n := n || jsonb_build_object('activity_log', c);
    delete from disclosure_requests where company_id = p_company;    get diagnostics c = row_count; n := n || jsonb_build_object('disclosure_requests', c);
  end if;

  if 'diagnosis' = any(p_parts) then
    delete from diagnosis_intakes where company_id = p_company;      get diagnostics c = row_count; n := n || jsonb_build_object('diagnosis_intakes', c);
    delete from diagnosis_results where company_id = p_company;      get diagnostics c = row_count; n := n || jsonb_build_object('diagnosis_results', c);
  end if;

  if 'status' = any(p_parts) then
    update companies set
      status = 'diagnosed', status_changed_at = now(),
      contract_started_at = null, kickoff_at = null, session1_at = null, midcheck_at = null, session2_at = null, session3_at = null,
      extension_until = null, grace_until = null, advisor_since = null, cancel_notice_at = null,
      applied_at = null, contracted_at = null, paid_at = null, reaccess_until = null
    where id = p_company;
    n := n || jsonb_build_object('status', 'diagnosed');
  end if;

  return n;
end;
$$;

-- お客様・ブラウザからは呼べない。サーバー（service role）だけ
revoke all on function public.reset_company(uuid, text[]) from public, anon, authenticated;
grant execute on function public.reset_company(uuid, text[]) to service_role;
