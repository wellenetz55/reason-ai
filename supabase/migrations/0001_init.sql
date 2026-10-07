-- reason-ai initial schema (docs/spec/01-data-model.md)
create extension if not exists "pgcrypto";

-- enums
create type company_status as enum ('diagnosed','onboarding','week1_2','week3_5','week6_8','extended','grace','locked','advisor','cancelled');
create type user_role as enum ('customer_admin','customer_member','operator');
create type meeting_kind as enum ('kickoff','session1','midcheck','session2','session3','advisor_monthly','internal');
create type document_kind as enum ('brochure','sales_deck','website','recruit','exhibition','testimonial','presentation','diagnosis_memo','other');
create type facet_kind as enum ('functional','emotional','by_target','by_trigger','competitor_gap','voice','history');
create type row_status as enum ('active','merged','dropped','held','separate');
create type review_action as enum ('fix','approve','hold');
create type brake_kind as enum ('distrust','unnecessary','unfit','nourgent');
create type evidence_tag as enum ('fact','verify','hypothesis');
create type evidence_kind as enum ('named_voice','public_voice','third_party','own_fact');
create type verdict_kind as enum ('superior','equal','inferior','unknown');
create type lock_session as enum ('s1','s2','s3');
create type homework_status as enum ('open','answered','passed');
create type question_kind as enum ('question','escalation','scope_out');
create type alert_kind as enum ('stale7','no_internal_meeting','homework_overdue','attitude_flag','disclosure_request','quota_reached','grace_ending','extension_ending','escalation');
create type touchpoint_kind as enum ('sales_talk','price_explanation','web','recruit_evp','quote_words','internal_onepager','other');
create type awareness_level as enum ('unaware','problem_aware','solution_aware');
create type deployment_status as enum ('draft','awaiting_review','approved','returned');
create type author_kind as enum ('customer','ai','operator');

-- organizations / users
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status company_status not null default 'diagnosed',
  status_changed_at timestamptz not null default now(),
  contract_started_at timestamptz,
  kickoff_at timestamptz,
  session1_at timestamptz,
  midcheck_at timestamptz,
  session2_at timestamptz,
  session3_at timestamptz,
  extension_until timestamptz,
  grace_until timestamptz,
  advisor_since timestamptz,
  cancel_notice_at timestamptz,
  generation_quota_month int not null default 10,
  generation_quota_grace int not null default 3,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  role user_role not null default 'customer_member',
  display_name text,
  title text,
  created_at timestamptz not null default now()
);

create table company_meetings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  kind meeting_kind not null,
  scheduled_at timestamptz not null,
  held_at timestamptz,
  agenda_sent_at timestamptz,
  notes text, -- operator only
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- step0 / step0.5
create table company_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  kind document_kind not null default 'other',
  title text not null,
  storage_path text,
  url text,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table company_profile_summary (
  company_id uuid primary key references companies(id) on delete cascade,
  draft_json jsonb,
  approved_json jsonb,
  q1_before text,
  q1_after text,
  approved_at timestamptz,
  updated_at timestamptz not null default now()
);

create table competitors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  website text,
  is_reference boolean not null default false,
  draft_json jsonb,
  approved_json jsonb,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

-- sheet
create table sheet_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  seq int not null,
  target text,
  target_tag text,
  facet facet_kind,
  round int not null default 1,
  value_raw text,
  value_merged text,
  value_final text,
  similar_group_id uuid,
  desire text,
  experience_value_v1 text,
  trust_axis text,
  experience_value text,
  hook text,
  because_phrase text,
  one_liner text,
  status row_status not null default 'active',
  dropped_reason text,
  rank int,
  is_primary boolean not null default false,
  is_sub_line boolean not null default false,
  created_by author_kind not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, seq)
);
create index on sheet_rows (company_id, status);

create table sheet_row_reviews (
  id uuid primary key default gen_random_uuid(),
  row_id uuid not null references sheet_rows(id) on delete cascade,
  column_key text not null,
  action review_action not null,
  before_text text,
  after_text text,
  reviewer_id uuid references profiles(id),
  dwell_ms int,
  created_at timestamptz not null default now()
);

create table brakes (
  id uuid primary key default gen_random_uuid(),
  row_id uuid not null references sheet_rows(id) on delete cascade,
  kind brake_kind not null,
  customer_words text,
  source_tag text,
  counter_message text,
  because text,
  evidence_tag evidence_tag not null default 'hypothesis',
  status text not null default 'active',
  created_by author_kind not null default 'ai',
  created_at timestamptz not null default now()
);

create table evidences (
  id uuid primary key default gen_random_uuid(),
  row_id uuid not null references sheet_rows(id) on delete cascade,
  what text,
  content text not null,
  kind evidence_kind not null,
  source text,
  strength text,
  created_at timestamptz not null default now()
);

create table competitor_comparisons (
  id uuid primary key default gen_random_uuid(),
  row_id uuid not null references sheet_rows(id) on delete cascade,
  competitor_id uuid not null references competitors(id) on delete cascade,
  verdict verdict_kind not null default 'unknown',
  reason text,
  to_verify text,
  unique (row_id, competitor_id)
);

create table litmus_niche (
  row_id uuid primary key references sheet_rows(id) on delete cascade,
  q1_pain_urgency boolean,
  q2_actively_seeking boolean,
  judged_by author_kind,
  updated_at timestamptz not null default now()
);

create table litmus_market (
  id uuid primary key default gen_random_uuid(),
  row_id uuid not null references sheet_rows(id) on delete cascade,
  scored_by author_kind not null,
  common_sense text,
  investment int, strength_asset int, feasibility int, beat_competitor int, internal_passion int, brand_purpose_fit int,
  magnitude_text text, magnitude_score int,
  kaiten_step int,
  zougenjofu text,
  total int,
  scored_at timestamptz not null default now(),
  unique (row_id, scored_by)
);

create table sheet_locks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  session lock_session not null,
  columns text[] not null,
  is_provisional boolean not null default false,
  locked_by uuid references profiles(id),
  locked_at timestamptz not null default now()
);

create table sheet_lock_history (
  id uuid primary key default gen_random_uuid(),
  lock_id uuid not null references sheet_locks(id) on delete cascade,
  row_id uuid references sheet_rows(id) on delete set null,
  column_key text not null,
  before_text text, after_text text, reason text,
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now()
);

create table member_notes (
  id uuid primary key default gen_random_uuid(),
  row_id uuid not null references sheet_rows(id) on delete cascade,
  column_key text,
  author_id uuid references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

-- homework / notifications / logs
create table homeworks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  priority int not null default 1,
  title text not null,
  why text,
  ask_whom_hint text,
  due_at timestamptz,
  status homework_status not null default 'open',
  answer text,
  asked_whom text,
  pass_reason text,
  answered_by uuid references profiles(id),
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

create table questions_to_operator (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  row_id uuid references sheet_rows(id) on delete set null,
  kind question_kind not null default 'question',
  body text not null,
  answered_body text,
  answered_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  kind alert_kind not null,
  payload jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table disclosure_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid references profiles(id),
  message text not null,
  created_at timestamptz not null default now()
);

create table activity_log (
  id bigserial primary key,
  company_id uuid references companies(id) on delete cascade,
  user_id uuid,
  event text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index on activity_log (company_id, created_at desc);

-- deployment
create table deployments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  touchpoint touchpoint_kind not null,
  awareness_level awareness_level not null,
  primary_row_id uuid references sheet_rows(id),
  content_json jsonb not null,
  techniques_json jsonb, -- operator only
  status deployment_status not null default 'draft',
  review_notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table generation_counters (
  company_id uuid not null references companies(id) on delete cascade,
  period text not null, -- 'YYYY-MM' or 'grace'
  count int not null default 0,
  primary key (company_id, period)
);

create table activation_packages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  version int not null default 1,
  items_json jsonb,
  q1_before text, q1_after text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

-- method assets (server only; never exposed to customer APIs)
create table method_facets (
  id uuid primary key default gen_random_uuid(),
  facet facet_kind not null,
  round int not null,
  prompt_template text not null,
  helper_examples text,
  unique (facet, round)
);
create table method_fixed_texts (
  key text primary key,
  body text not null,
  updated_at timestamptz not null default now()
);
create table method_techniques (
  id serial primary key,
  step int not null,
  kind text not null, -- 'kaiten' | 'brain'
  name text not null,
  usage text
);
create table method_prompts (
  key text not null,
  version int not null,
  body text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (key, version)
);

-- helpers
create or replace function current_company_id() returns uuid
language sql stable as $$
  select company_id from profiles where id = auth.uid()
$$;
create or replace function is_operator() returns boolean
language sql stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'operator')
$$;

-- RLS
alter table companies enable row level security;
alter table profiles enable row level security;
alter table company_meetings enable row level security;
alter table company_documents enable row level security;
alter table company_profile_summary enable row level security;
alter table competitors enable row level security;
alter table sheet_rows enable row level security;
alter table sheet_row_reviews enable row level security;
alter table brakes enable row level security;
alter table evidences enable row level security;
alter table competitor_comparisons enable row level security;
alter table litmus_niche enable row level security;
alter table litmus_market enable row level security;
alter table sheet_locks enable row level security;
alter table sheet_lock_history enable row level security;
alter table member_notes enable row level security;
alter table homeworks enable row level security;
alter table questions_to_operator enable row level security;
alter table alerts enable row level security;
alter table disclosure_requests enable row level security;
alter table activity_log enable row level security;
alter table deployments enable row level security;
alter table generation_counters enable row level security;
alter table activation_packages enable row level security;
alter table method_facets enable row level security;
alter table method_fixed_texts enable row level security;
alter table method_techniques enable row level security;
alter table method_prompts enable row level security;

-- operator: everything
create policy op_all_companies on companies for all using (is_operator()) with check (is_operator());
create policy op_all_profiles on profiles for all using (is_operator()) with check (is_operator());
create policy op_all_meetings on company_meetings for all using (is_operator()) with check (is_operator());
create policy op_all_documents on company_documents for all using (is_operator()) with check (is_operator());
create policy op_all_summary on company_profile_summary for all using (is_operator()) with check (is_operator());
create policy op_all_competitors on competitors for all using (is_operator()) with check (is_operator());
create policy op_all_rows on sheet_rows for all using (is_operator()) with check (is_operator());
create policy op_all_reviews on sheet_row_reviews for all using (is_operator()) with check (is_operator());
create policy op_all_brakes on brakes for all using (is_operator()) with check (is_operator());
create policy op_all_evidences on evidences for all using (is_operator()) with check (is_operator());
create policy op_all_cc on competitor_comparisons for all using (is_operator()) with check (is_operator());
create policy op_all_ln on litmus_niche for all using (is_operator()) with check (is_operator());
create policy op_all_lm on litmus_market for all using (is_operator()) with check (is_operator());
create policy op_all_locks on sheet_locks for all using (is_operator()) with check (is_operator());
create policy op_all_lockhist on sheet_lock_history for all using (is_operator()) with check (is_operator());
create policy op_all_notes on member_notes for all using (is_operator()) with check (is_operator());
create policy op_all_hw on homeworks for all using (is_operator()) with check (is_operator());
create policy op_all_q on questions_to_operator for all using (is_operator()) with check (is_operator());
create policy op_all_alerts on alerts for all using (is_operator()) with check (is_operator());
create policy op_all_disc on disclosure_requests for all using (is_operator()) with check (is_operator());
create policy op_all_log on activity_log for all using (is_operator()) with check (is_operator());
create policy op_all_dep on deployments for all using (is_operator()) with check (is_operator());
create policy op_all_gc on generation_counters for all using (is_operator()) with check (is_operator());
create policy op_all_ap on activation_packages for all using (is_operator()) with check (is_operator());
-- method assets: operator read only via client; writes via service role
create policy op_read_mf on method_facets for select using (is_operator());
create policy op_read_mt on method_fixed_texts for select using (is_operator());
create policy op_read_mtech on method_techniques for select using (is_operator());
create policy op_read_mp on method_prompts for select using (is_operator());

-- customer: own company
create policy cu_read_company on companies for select using (id = current_company_id());
create policy cu_read_profiles on profiles for select using (company_id = current_company_id() or id = auth.uid());
create policy cu_update_self on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy cu_meetings on company_meetings for select using (company_id = current_company_id());
create policy cu_meetings_ins on company_meetings for insert with check (company_id = current_company_id() and kind = 'internal');
create policy cu_documents on company_documents for all using (company_id = current_company_id()) with check (company_id = current_company_id());
create policy cu_summary on company_profile_summary for all using (company_id = current_company_id()) with check (company_id = current_company_id());
create policy cu_competitors on competitors for all using (company_id = current_company_id()) with check (company_id = current_company_id());
create policy cu_rows on sheet_rows for all using (company_id = current_company_id()) with check (company_id = current_company_id());
create policy cu_reviews on sheet_row_reviews for all using (exists (select 1 from sheet_rows r where r.id = row_id and r.company_id = current_company_id())) with check (exists (select 1 from sheet_rows r where r.id = row_id and r.company_id = current_company_id()));
create policy cu_brakes on brakes for all using (exists (select 1 from sheet_rows r where r.id = row_id and r.company_id = current_company_id())) with check (exists (select 1 from sheet_rows r where r.id = row_id and r.company_id = current_company_id()));
create policy cu_evidences on evidences for all using (exists (select 1 from sheet_rows r where r.id = row_id and r.company_id = current_company_id())) with check (exists (select 1 from sheet_rows r where r.id = row_id and r.company_id = current_company_id()));
create policy cu_cc on competitor_comparisons for all using (exists (select 1 from sheet_rows r where r.id = row_id and r.company_id = current_company_id())) with check (exists (select 1 from sheet_rows r where r.id = row_id and r.company_id = current_company_id()));
create policy cu_ln on litmus_niche for all using (exists (select 1 from sheet_rows r where r.id = row_id and r.company_id = current_company_id())) with check (exists (select 1 from sheet_rows r where r.id = row_id and r.company_id = current_company_id()));
-- customer sees own self-scores and AI scores; operator scores only after session2 lock (enforced in app layer via view)
create policy cu_lm on litmus_market for all using (exists (select 1 from sheet_rows r where r.id = row_id and r.company_id = current_company_id()) and scored_by <> 'operator') with check (exists (select 1 from sheet_rows r where r.id = row_id and r.company_id = current_company_id()) and scored_by = 'customer');
create policy cu_locks on sheet_locks for select using (company_id = current_company_id());
create policy cu_notes on member_notes for all using (exists (select 1 from sheet_rows r where r.id = row_id and r.company_id = current_company_id())) with check (exists (select 1 from sheet_rows r where r.id = row_id and r.company_id = current_company_id()));
create policy cu_hw on homeworks for all using (company_id = current_company_id()) with check (company_id = current_company_id());
create policy cu_q on questions_to_operator for all using (company_id = current_company_id()) with check (company_id = current_company_id());
create policy cu_log_ins on activity_log for insert with check (company_id = current_company_id());
create policy cu_dep on deployments for all using (company_id = current_company_id()) with check (company_id = current_company_id());
create policy cu_gc on generation_counters for select using (company_id = current_company_id());
create policy cu_ap on activation_packages for select using (company_id = current_company_id());

-- customer-safe view of deployments (no techniques)
create view deployments_customer as
  select id, company_id, touchpoint, awareness_level, primary_row_id, content_json, status, review_notes, created_by, created_at
  from deployments;

-- divergence progress view
create view v_divergence_progress as
  with f as (
    select company_id, coalesce(facet::text,'none') as facet, count(*) as cnt
    from sheet_rows where status in ('active','held') group by 1,2
  )
  select r.company_id,
    count(*) filter (where r.status in ('active','held')) as row_count,
    max(r.round) as max_round,
    (select jsonb_object_agg(f.facet, f.cnt) from f where f.company_id = r.company_id) as by_facet,
    count(*) filter (where r.status in ('active','held')) >= 20 as reached_20,
    count(*) filter (where r.status in ('active','held')) >= 30 as reached_30
  from sheet_rows r
  group by r.company_id;

-- updated_at trigger
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger trg_sheet_rows_updated before update on sheet_rows for each row execute function set_updated_at();
