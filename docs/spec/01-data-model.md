# データモデル（Supabase / Postgres）

すべてのテーブルは `company_id` でテナント分離し、RLS を必須とする。operator は全社を見られる。顧客ロールは自社のみ。

## 1. 組織・ユーザー

| テーブル | 主な列 | 備考 |
| --- | --- | --- |
| `companies` | id, name, status(enum: diagnosed/onboarding/week1_2/week3_5/week6_8/extended/grace/locked/advisor/cancelled), status_changed_at, contract_started_at, kickoff_at, session1_at, midcheck_at, session2_at, session3_at, extension_until, grace_until, advisor_since, cancel_notice_at, generation_quota_month(int, default 10), generation_quota_grace(int, default 3), created_at | 状態遷移は operator かスケジューラのみ |
| `profiles` | id(=auth.users.id), company_id(null=operator), role(enum: customer_admin/customer_member/operator), display_name, title(役職) | |
| `company_meetings` | id, company_id, kind(enum: kickoff/session1/midcheck/session2/session3/advisor_monthly/internal), scheduled_at, held_at, agenda_sent_at, notes(operator only) | `internal`=顧客の社内打ち合わせ登録（W3〜5で最低1回必須） |

## 2. Step0 / Step0.5

| テーブル | 主な列 | 備考 |
| --- | --- | --- |
| `company_documents` | id, company_id, kind(enum: brochure/sales_deck/website/recruit/exhibition/testimonial/presentation/diagnosis_memo/other), title, storage_path, url, uploaded_by, created_at | 上げないもの（決算・顧客リスト・契約書・給与）は画面で明記 |
| `company_profile_summary` | company_id, draft_json(AI), approved_json(顧客修正済), q1_before(会社を一言で・診断時), q1_after, approved_at | Step0の自社理解サマリー。各項目に「直す/承認/保留」 |
| `competitors` | id, company_id, name, website, draft_json(AI: 見え方/強み/弱み/訴求の言葉/出所URL), approved_json, approved_at | Step0.5。最大3社（＋参考） |

## 3. 提供価値シート

| テーブル | 主な列 | 備考 |
| --- | --- | --- |
| `sheet_rows` | id, company_id, seq(整理番号), target(①), target_tag, facet(enum: functional/emotional/by_target/by_trigger/competitor_gap/voice/history), round(周回 1..n), value_raw(②洗い出し), value_merged(統合案), value_final(最終案), similar_group_id, desire(③ 6大欲求 主/副), experience_value_v1(第1塗りの体験価値), trust_axis(T/R/U/S/T), experience_value(⑦), hook(⑧), because_phrase(⑨), one_liner(一言で・中学生版), status(enum: active/merged/dropped/held/separate), dropped_reason, rank, is_primary(1位), is_sub_line(別線), created_by(customer/ai), created_at, updated_at | グレー=dropped/merged。削除は物理的にしない |
| `sheet_row_reviews` | id, row_id, column_key, action(enum: fix/approve/hold), before_text, after_text, reviewer_id, dwell_ms(その行の滞在時間), created_at | 姿勢シグナルの元データ |
| `brakes` | id, row_id, kind(enum: distrust/unnecessary/unfit/nourgent), customer_words(④), source_tag, counter_message(⑤), because(⑥), evidence_tag(enum: fact/verify/hypothesis), status(active/dropped), created_at | 1行×4不（複数可） |
| `evidences` | id, row_id, what(何を裏づけるか), content, kind(enum: named_voice/public_voice/third_party/own_fact), source, strength(strong/mid/weak), created_at | ⑩ |
| `competitor_comparisons` | id, row_id, competitor_id, verdict(enum: superior/equal/inferior/unknown), reason, to_verify | |
| `litmus_niche` | row_id, q1_pain_urgency(bool/null), q2_actively_seeking(bool/null), judged_by(ai/customer/operator) | 第1塗り末の2問 |
| `litmus_market` | row_id, common_sense(常識/非常識), investment, strength_asset, feasibility, beat_competitor, internal_passion, brand_purpose_fit, magnitude_text(金額か件数), magnitude_score, kaiten_step(1..5/null), zougenjofu(増/減/除/付 メモ), total, scored_by(ai/operator), scored_at | 市場フィット試験紙＋追加軸 |
| `sheet_locks` | id, company_id, session(enum: s1/s2/s3), columns(text[]), locked_at, locked_by, is_provisional(仮封) | |
| `sheet_lock_history` | id, lock_id, row_id, column_key, before, after, reason, changed_by, changed_at | 封をした列の変更ログ |
| `member_notes` | id, row_id, column_key, author_id, body, created_at | TOMRA方式の担当者別メモ列 |

### 発散週の集計（ビュー）
`v_divergence_progress(company_id)`: 行数（active+held）、面ごとの行数、周回数、20行到達フラグ、30行到達フラグ。統合案列のロック判定は「active 行 < 20」。

## 4. 宿題・通知・ログ

| テーブル | 主な列 | 備考 |
| --- | --- | --- |
| `homeworks` | id, company_id, priority(★〜★★★), title, why(効く場所), ask_whom_hint(誰に聞くか), due_at, status(enum: open/answered/passed), answer, asked_whom(必須), answered_by, answered_at | 冒頭固定文「一人で決めないでください…」 |
| `questions_to_operator` | id, company_id, row_id(null可), body, kind(enum: question/escalation/scope_out), answered_body, answered_at | 「ベレネッツに質問を残す」。kind=escalation は本業引き上げ候補 |
| `alerts` | id, company_id, kind(enum: stale7/no_internal_meeting/homework_overdue/attitude_flag/disclosure_request/quota_reached/grace_ending/extension_ending), payload, created_at, resolved_at | 画面2に表示、メール通知 |
| `disclosure_requests` | id, company_id, user_id, message, created_at | 禁則：メソッド開示要求のログ。同一社3回で alert |
| `activity_log` | id, company_id, user_id, event, payload, created_at | ログイン・承認・生成など全操作 |

## 5. 展開

| テーブル | 主な列 | 備考 |
| --- | --- | --- |
| `deployments` | id, company_id, touchpoint(enum: sales_talk/price_explanation/web/recruit_evp/quote_words/internal_onepager/other), awareness_level(enum: unaware/problem_aware/solution_aware), primary_row_id, content_json(ブロック: hook/empathy/proof/urgency/cta 各 text + used_row_ids + evidence_tags), techniques_json(operator only: 使った回天・脳科学手法), status(enum: draft/awaiting_review/approved/returned), review_notes, created_by, created_at | 顧客画面は techniques_json を返さない |
| `generation_counters` | company_id, period(YYYY-MM or 'grace'), count | 上限判定 |
| `activation_packages` | id, company_id, version, items_json(接点マップ/台本/…), q1_before, q1_after, approved_at | 第3層 |

## 6. メソッド資産（非公開・サーバ側のみ）

| テーブル | 備考 |
| --- | --- |
| `method_facets` | 7面の問いテンプレ（周回別：1周目=広く／2周目=細分化／3周目=掛け合わせ） |
| `method_fixed_texts` | 各塗りの冒頭固定文（第1塗り／第2塗り④／③⑤⑥／⑦／⑩） |
| `method_techniques` | 回天×脳科学 103手法（step, kind, name, usage）。**顧客向けAPIからは一切返さない** |
| `method_prompts` | システムプロンプト本文（バージョン管理） |

これらは service role でのみ読む。クライアントに送るAPIレスポンスには含めない。リポジトリにも本文は置かない（seed は operator が管理画面から投入、または環境変数経由）。

## 7. RLS 方針

- 顧客ロール: `company_id = auth.jwt().company_id` の行のみ。`deployments.techniques_json`、`company_meetings.notes`、`litmus_market.scored_by='operator'` の点数（確認②まで）、`alerts`、`disclosure_requests`、`method_*` は顧客に返さない（ビューで列を落とす）
- operator: 全行 read/write
- `sheet_rows.status='dropped'` は顧客にも見せる（グレー表示）。物理削除なし
