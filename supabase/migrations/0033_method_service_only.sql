-- メソッド資産（method_*）は、サーバ側（service role）からだけ読む。
-- アプリはすべて service role 経由で読んでいるため、ログイン中の利用者（ベレネッツのスタッフを含む）が
-- APIを直接呼んで指示文・手法・固定文を一括で取得できる道を閉じる。管理画面の「メソッド」はスーパー管理者のみ（画面側で判定済み）。
drop policy if exists op_read_mf on method_facets;
drop policy if exists op_read_mt on method_fixed_texts;
drop policy if exists op_read_mp on method_prompts;
drop policy if exists op_read_mtech on method_techniques;
revoke all on method_facets, method_fixed_texts, method_prompts, method_techniques from anon, authenticated;
