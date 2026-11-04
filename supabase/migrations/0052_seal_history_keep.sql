-- 封を解いても、変更の記録（理由・前後の文）を消さずに残す。
-- これまでは封（sheet_locks）を消すと、その封についた記録も一緒に消えていた（on delete cascade）。
-- 記録に会社と確認セッションを持たせ、封が消えても誰の・どのセッションの記録か分かるようにする。
alter table sheet_lock_history add column if not exists company_id uuid references companies(id) on delete cascade;
alter table sheet_lock_history add column if not exists session text;
update sheet_lock_history h set company_id = l.company_id, session = l.session::text
  from sheet_locks l where l.id = h.lock_id and (h.company_id is null or h.session is null);

-- 記録を書くときに、封から会社とセッションを自動で入れる（アプリ側の書き込みはそのまま）
create or replace function sheet_lock_history_fill() returns trigger language plpgsql set search_path = public as $$
begin
  if new.lock_id is not null and (new.company_id is null or new.session is null) then
    select l.company_id, l.session::text into new.company_id, new.session from sheet_locks l where l.id = new.lock_id;
  end if;
  return new;
end $$;
drop trigger if exists sheet_lock_history_fill on sheet_lock_history;
create trigger sheet_lock_history_fill before insert on sheet_lock_history for each row execute function sheet_lock_history_fill();

-- 封を消しても記録は残す（lock_id だけ空になる）
alter table sheet_lock_history alter column lock_id drop not null;
alter table sheet_lock_history drop constraint if exists sheet_lock_history_lock_id_fkey;
alter table sheet_lock_history add constraint sheet_lock_history_lock_id_fkey foreign key (lock_id) references sheet_locks(id) on delete set null;
create index if not exists sheet_lock_history_company_idx on sheet_lock_history (company_id, changed_at desc);

-- シートを初期化（reset_company の 'sheet'）したときは、封の記録も一緒に消す。
-- これまでは封を消すと記録も消えていたが、上の変更で残るようになったため、初期化では明示して消す（控えは消す前にアプリが保存する）。
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
    delete from sheet_lock_history where company_id = p_company;     get diagnostics c = row_count; n := n || jsonb_build_object('sheet_lock_history', c);
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
