-- STEP 6 ベレネッツ側の採点画面
-- 1. ベレネッツの仮順位（scored_by='operator' の行にだけ入れる。cu_lm_sel により確認セッション②まではお客様に見えない）
alter table litmus_market add column if not exists rank int;
alter table litmus_market add constraint litmus_market_rank check (rank is null or (rank between 1 and 999)) not valid;
alter table litmus_market add constraint litmus_market_kaiten check (kaiten_step is null or (kaiten_step between 1 and 5)) not valid;
alter table litmus_market add constraint litmus_market_mag check (magnitude_score is null or (magnitude_score between 0 and 3)) not valid;

-- 2. お客様のロールでは、自分の行に保存された回天ステップ・順位（ベレネッツの列）を書けない
create or replace function guard_customer_litmus_market() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated' and not is_operator() then
    new.kaiten_step := null;
    new.rank := null;
    new.magnitude_score := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_customer_litmus_market on litmus_market;
create trigger trg_guard_customer_litmus_market before insert or update on litmus_market for each row execute function guard_customer_litmus_market();

-- 3. sheet_rows の順位・主役フラグはベレネッツだけが決める（仕様 00：順位は operator のみ）
create or replace function guard_customer_sheet_rank() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated' and not is_operator() then
    if tg_op = 'INSERT' then
      new.rank := null;
      new.is_primary := false;
    else
      new.rank := old.rank;
      new.is_primary := old.is_primary;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_customer_sheet_rank on sheet_rows;
create trigger trg_guard_customer_sheet_rank before insert or update on sheet_rows for each row execute function guard_customer_sheet_rank();

-- 4. 回天のステップと仮順位は、ログインした利用者のロール（お客様・ベレネッツ共通）からは読めないようにする。
--    ベレネッツの画面はサーバ側（service role）で読む。お客様には確認セッション②のあとも出さない。
revoke select on litmus_market from authenticated;
grant select (id, row_id, scored_by, common_sense, investment, strength_asset, feasibility, beat_competitor, internal_passion, brand_purpose_fit,
              magnitude_text, magnitude_score, zougenjofu, total, scored_at) on litmus_market to authenticated;
