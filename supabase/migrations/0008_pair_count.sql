-- STEP 1 は提供価値・体験価値を対で書く。対になっている行数（pair_count）を進捗に加える
-- create or replace のため新列は末尾に置く
create or replace view v_divergence_progress as
  with f as (
    select company_id, coalesce(facet::text,'none') as facet, count(*) as cnt
    from sheet_rows where status in ('active','held') group by 1,2
  )
  select r.company_id,
    count(*) filter (where r.status in ('active','held')) as row_count,
    max(r.round) as max_round,
    (select jsonb_object_agg(f.facet, f.cnt) from f where f.company_id = r.company_id) as by_facet,
    count(*) filter (where r.status in ('active','held') and coalesce(r.experience_value_v1,'') <> '') >= 20 as reached_20,
    count(*) filter (where r.status in ('active','held') and coalesce(r.experience_value_v1,'') <> '') >= 30 as reached_30,
    count(*) filter (where r.status in ('active','held') and coalesce(r.experience_value_v1,'') <> '') as pair_count
  from sheet_rows r
  group by r.company_id;
