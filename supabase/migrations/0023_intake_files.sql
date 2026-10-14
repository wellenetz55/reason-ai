-- 0023 適合診断の面談メモ・資料（複数ファイル）。ベレネッツだけが見る。お客様には出ない
-- ファイル本体は company-docs バケットの _intake/<会社ID>/ に置く（お客様の読める場所ではない）
create table if not exists diagnosis_intake_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  text_content text,            -- 取り出せた文字（AIの下書きの材料）。画像などは null
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists diagnosis_intake_files_company on diagnosis_intake_files(company_id, created_at);
alter table diagnosis_intake_files enable row level security;
create policy op_all_intake_files on diagnosis_intake_files for all using (is_operator()) with check (is_operator());

-- リセット（0022）でも面談メモを消すように差し替え
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
    delete from diagnosis_intake_files where company_id = p_company; get diagnostics c = row_count; n := n || jsonb_build_object('diagnosis_intake_files', c);
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

revoke all on function public.reset_company(uuid, text[]) from public, anon, authenticated;
grant execute on function public.reset_company(uuid, text[]) to service_role;
