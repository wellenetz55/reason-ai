-- STEP 6（市場で通用するかを試す）
-- ニッチの2問：AIの仮判定は別の列に置き、お客様の答え（q1/q2）とは分ける
alter table litmus_niche add column if not exists ai_q1 boolean;
alter table litmus_niche add column if not exists ai_q2 boolean;
alter table litmus_niche add column if not exists ai_note text;
alter table litmus_niche add constraint litmus_niche_len check (char_length(coalesce(ai_note, '')) <= 1000) not valid;

-- 市場フィット：お客様のメモ欄の長さ
alter table litmus_market add constraint litmus_market_len check (
  char_length(coalesce(magnitude_text, '')) <= 500 and char_length(coalesce(zougenjofu, '')) <= 1000 and char_length(coalesce(common_sense, '')) <= 20
) not valid;

-- ベレネッツの採点（scored_by='operator'）は、確認セッション②まで（状態が仕上げ＝week6_8 になるまで）お客様に見せない（仕様 01）
drop policy if exists cu_lm_sel on litmus_market;
create policy cu_lm_sel on litmus_market for select using (
  exists (select 1 from sheet_rows r where r.id = litmus_market.row_id and r.company_id = current_company_id())
  and (scored_by <> 'operator'::author_kind
       or exists (select 1 from companies c where c.id = current_company_id() and c.status in ('week6_8', 'extended', 'grace', 'advisor', 'locked')))
);
