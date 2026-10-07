# 通知・スケジューラ

実装: Vercel Cron（毎日 06:00 JST）＋メール送信（Resend 想定。送信元は運営ドメイン）。

| 種類 | 条件 | 宛先 | 内容 |
| --- | --- | --- | --- |
| stale7 | 最終操作から7日 | operator（一覧黄色）＋顧客（ひと押しメールは operator が手動送信） | 「止まっています。次にやる1つ: ○○」 |
| homework_overdue | 期限超過の宿題 | 顧客 | 宿題名・誰に聞くかヒント |
| no_internal_meeting | W3〜5 で `company_meetings.kind=internal` が未登録 | 顧客＋operator | 登録を促す |
| meeting_agenda | 社内打ち合わせ／確認セッションの前日 | 顧客（確認セッションは operator にも） | 未完了宿題・保留行・仮説タグの行・詰まっている列 |
| midcheck_reminder | W3末の中間チェック前日 | operator | 「詰まりを聞くだけ。赤入れしない」 |
| quota_reached | 生成上限到達 | 顧客 | advisor: 来月か相談／grace: 顧問の案内 |
| grace_ending | 猶予期限7日前 | 顧客＋operator | 顧問の案内 |
| extension_ending | 延長期限7日前 | 顧客＋operator | 顧問扱いへの移行予告 |
| disclosure_request | 開示要求3回目 | operator | 質問文のログ |
| attitude_flag | 姿勢シグナル複数該当 | operator | 該当サインと行番号 |
| escalation | `questions_to_operator.kind=escalation` | operator | 本業引き上げ候補 |

状態の自動遷移（スケジューラ）:
- `grace` → `locked`: grace_until 到過
- `extended` → `advisor`（顧問扱い）: extension_until 到過かつ確認③未実施

メール本文に手法名・内部タグ名を含めない。
