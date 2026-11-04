-- 20組・30組の数え方（0046 の続き）：御社が書いた行でも、体験価値がAIの下書きのまま（未確認）の行は数えない。
-- AIが体験価値を下書きした行には target_tag = '仮説（体験価値はAI下書き）' が付き、御社が承認・確定・直すと外れる。
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
    count(*) filter (where r.status in ('active','held') and coalesce(r.experience_value_v1,'') <> '' and r.created_by <> 'ai' and coalesce(r.target_tag,'') <> '仮説（体験価値はAI下書き）') >= 20 as reached_20,
    count(*) filter (where r.status in ('active','held') and coalesce(r.experience_value_v1,'') <> '' and r.created_by <> 'ai' and coalesce(r.target_tag,'') <> '仮説（体験価値はAI下書き）') >= 30 as reached_30,
    count(*) filter (where r.status in ('active','held') and coalesce(r.experience_value_v1,'') <> '' and r.created_by <> 'ai' and coalesce(r.target_tag,'') <> '仮説（体験価値はAI下書き）') as pair_count
  from sheet_rows r
  group by r.company_id;
