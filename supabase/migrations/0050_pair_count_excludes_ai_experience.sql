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

-- これまで「確定」では「仮説（体験価値はAI下書き）」の印が外れなかったため、確定済みの行に印が残っている。
-- このままだと上の数え方で確定済みの組が20組から外れてしまうので、確定済みの行の印は外しておく。
-- 承認だけした行（確定はしていない）も、承認・直すの記録があれば外す
update sheet_rows r set target_tag = null
where r.target_tag = '仮説（体験価値はAI下書き）'
  and (r.confirmed_at is not null
       or exists (select 1 from sheet_row_reviews v where v.row_id = r.id and v.action in ('approve', 'fix')));
