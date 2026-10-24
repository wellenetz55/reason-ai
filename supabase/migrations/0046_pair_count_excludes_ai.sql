-- 20組・30組の数え方：お客様がまだ見ていないAIの下書き（created_by='ai'）は数えない。
-- AIの下書きは、お客様が承認・確定・直すと created_by='customer' になり、そこから数える。
-- 列の並びは変えない（create or replace view のため）。security_invoker は 0015 の設定を保つ。
create or replace view v_divergence_progress with (security_invoker = true) as
  with f as (
    select company_id, coalesce(facet::text,'none') as facet, count(*) as cnt
    from sheet_rows where status in ('active','held') group by 1,2
  )
  select r.company_id,
    count(*) filter (where r.status in ('active','held')) as row_count,
    max(r.round) as max_round,
    (select jsonb_object_agg(f.facet, f.cnt) from f where f.company_id = r.company_id) as by_facet,
    count(*) filter (where r.status in ('active','held') and coalesce(r.experience_value_v1,'') <> '' and r.created_by <> 'ai') >= 20 as reached_20,
    count(*) filter (where r.status in ('active','held') and coalesce(r.experience_value_v1,'') <> '' and r.created_by <> 'ai') >= 30 as reached_30,
    count(*) filter (where r.status in ('active','held') and coalesce(r.experience_value_v1,'') <> '' and r.created_by <> 'ai') as pair_count
  from sheet_rows r
  group by r.company_id;
