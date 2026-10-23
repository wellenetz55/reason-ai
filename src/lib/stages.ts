export type Stage = {
  key: string;
  step: string; // "STEP 1" など。左メニューのラベル
  label: string;
  href: string;
  guide: { lead: string; body: string; items?: { name: string; body: string; example: string }[] }; // 各段階の画面に必ず出す平易な説明（ELI5）
  statuses: string[]; // company statuses in which this stage is open
};

export const STAGES: Stage[] = [
  { key: "step0", guide: { lead: "まず、御社のことをAIに教える段階です。", body: "会社案内やWebサイトを登録すると、AIが「御社はこういう会社です」という説明を下書きします。合っているところは残し、違うところを直してください。ここが土台になるので、丁寧に直すほど後の段階がラクになります。" }, step: "STEP 0", label: "会社を知る", href: "/step0", statuses: ["onboarding", "week1_2", "week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "diverge", guide: { lead: "御社の「特徴」と、お客様が「感じること」を、対にして全部書き出す段階です。", body: "御社は〜できる（提供価値）。だから、お客様は〜と感じることができる（体験価値）。この2つを1組にして書きます。たった数個で終わらず、光の当て方を変え、気づかれていないこと、小さいこと、当たり前だと思うことも全部出します。とにかく細分化して下さい。機能面のほか情緒面など全て。同じ特徴から別の感じ方が出たら、もう1組。目標は30組。毎日ちがう角度の問いが出るので、それに答えるだけで増えていきます。詰まったらAIに下書きを頼めます。" }, step: "STEP 1", label: "提供価値・体験価値を出す", href: "/sheet/diverge", statuses: ["week1_2", "week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "merge", guide: { lead: "たくさん出した組を、まず診断し、似たものどうしでまとめて、残す言葉を選ぶ段階です。", body: "最初に2つの診断をします。「偏り診断」は、特定の角度ばかり多くなっていないかを見ます。「ふわっと診断」は、提供価値・体験価値が、どの会社でも言える日本語特有のふわっとした言葉になっていないかを見て、言い直し案を出します。そのあと「同じことを言っている組」を一つにして、本当に御社らしいものだけを残します。消すのではなく「保留」にするので、あとで STEP 1 の一覧から戻せます。" }, step: "STEP 2", label: "まとめて絞る", href: "/sheet/merge", statuses: ["week1_2", "week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "brakes", guide: {
      lead: "お客様が御社を選ぶ直前に「やっぱりやめようかな」と思う理由を書き出す段階です。",
      body: "人は買う前に、必ず何かが引っかかります。この引っかかり＝ブレーキは、次の4つのどれかです。提供価値・体験価値の組ごとに、お客様の言葉でブレーキを書き出しておくと、次の段階で先回りの答えが作れます。",
      items: [
        { name: "不信", body: "「本当にそうなの？」と、言っていることを疑う。", example: "「実績があると言うけど、うちの業界でも通用するの？」" },
        { name: "不要", body: "「うちには要らないかも」と、必要性を感じない。", example: "「今のやり方でも、そこまで困っていない」" },
        { name: "不適", body: "「うちには合わないかも」と、自分に当てはまらないと思う。", example: "「大きい会社向けでしょ。うちの規模だと持て余しそう」" },
        { name: "不急", body: "「今じゃなくていい」と、急ぐ理由が見つからない。", example: "「いい話だけど、来期の予算で考えよう」" },
      ],
    }, step: "STEP 3", label: "お客様のブレーキ", href: "/sheet/brakes", statuses: ["week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "counter", guide: { lead: "書き出したブレーキを、一つずつ外していく段階です。", body: "ブレーキごとに「それならこう答えます」という言葉を用意します。前の段階で出した「できること」が、ここで答えの材料になります。答えには「事実」「要確認」「仮説」の印をつけて、どこまで確かかを分けておきます。" }, step: "STEP 4", label: "ブレーキを外す", href: "/sheet/counter", statuses: ["week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "trust", guide: { lead: "STEP 1 の組に「なぜなら」を足して、三連にする段階です。", body: "御社は〜できる。だから、お客様は〜と感じられる。なぜなら、〜だから。ここまで言い切って1組です。「なぜなら」は、御社がどうやってそれを実現しているかの根拠（プロセス・数字・資格・体制・保証など）。根拠がない約束は、どんなに良い言葉でも浮ついて聞こえます。体験価値も、お客様の気持ちの変化になっているか、ここでもう一度磨きます。「当社しかありません」と言える根拠には印をつけます。" }, step: "STEP 5", label: "体験価値を磨く", href: "/sheet/trust", statuses: ["week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "litmus", guide: { lead: "残した言葉が、本当に選ばれる理由になるかを見極める段階です。", body: "まず、見込み客がその悩みに切実さを感じているか、自分から解決策を探しているかを2問で確かめます。次に、市場で通用するか（業界の常識をくつがえすか・投資する価値・強み・実現できるか・競合に勝てるか・社内の熱意・ブランドの目的）を◎○△×で自己評価します。ここで弱い言葉に気づけば、あとで大きく直さずに済みます。" }, step: "STEP 6", label: "選ばれる理由の見極め", href: "/sheet/litmus", statuses: ["week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "evidence", guide: { lead: "「なぜなら」の裏づけを集める段階です。", body: "STEP 5 で書いた「なぜなら」が本当だと示せるもの（お客様の声・数字・実績・第三者の評価）を探して、組ごとにつけていきます。AIが会社の資料や面談の記録から候補を探すので、採用するかどうかを決めてください。裏づけがついた「なぜなら」は、ボタンで「仮説」から「事実」に変えられ、営業やWebで安心して使える言葉になります。" }, step: "STEP 7", label: "証拠を集める", href: "/sheet/evidence", statuses: ["week6_8", "extended", "grace", "advisor"] },
  { key: "deploy", guide: { lead: "完成した言葉を、営業トーク・価格の説明・Webなど、実際に使う場面の形に変える段階です。", body: "ここまでで作った提供価値シートが材料です。場面を選ぶと、その場面に合った文章の下書きが出ます。それを御社の言葉に直して、すぐ使える形にします。" }, step: "FINAL", label: "接点に展開する", href: "/deploy", statuses: ["week6_8", "extended", "grace", "advisor"] },
];

export const STATUS_LABEL: Record<string, string> = {
  diagnosed: "診断済み（契約前）",
  onboarding: "キックオフ前",
  week1_2: "骨格をつくる（1〜2週目）",
  week3_5: "肉付けする（3〜5週目）",
  week6_8: "仕上げる（6〜8週目）",
  extended: "延長中",
  grace: "猶予期間",
  locked: "ダウンロードのみ",
  advisor: "顧問",
  cancelled: "解約",
};

/** 画面がまだ準備中の段階（ホームの「いま進めること」からボタンで案内しない） */
export const NOT_READY = new Set(["deploy"]);

export function isStageOpen(stage: Stage, status: string) {
  return stage.statuses.includes(status);
}

/** 会社の状態（と発散行数）から、いま進める段階を返す。ホームと左メニューで共用 */
export function currentStep(status: string, rows: number) {
  switch (status) {
    case "onboarding":
      return { key: "step0", title: "会社資料を上げる", body: "会社案内やWebサイトを登録すると、AIが御社の説明の下書きを作ります。それを直すところから始まります。" };
    case "week1_2":
      return rows < 20
        ? { key: "diverge", title: "提供価値・体験価値を出す", body: `「御社は〜できる。だから、お客様は〜と感じられる」を対で書き出す段階です。あと${20 - rows}組で次に進めます（目標30組）。` }
        : { key: "merge", title: "まとめて絞る", body: `提供価値・体験価値が${rows}組そろいました。似たものをまとめ、残す言葉を選ぶ段階です。` };
    case "week3_5":
      return { key: "brakes", title: "お客様のブレーキ", body: "お客様が御社を選ぶのをためらう理由（不信・不要・不適・不急）を、残した組ごとに書き出す段階です。" };
    // 展開の画面は準備中のため、証拠集めへ案内する（NOT_READY から deploy が外れたら見直す）
    case "week6_8":
    case "extended":
      return { key: "evidence", title: "証拠を集める", body: "「なぜなら」を裏づける証拠（お客様の声・第三者の数字・自社の事実）を、順位の高い組から集める段階です。AIが資料から候補を探します。" };
    case "grace":
      return { key: "trust", title: "完成したシートを見る", body: "シートを編集できる期間は終わりました。完成した提供価値シートの閲覧と、Excelのダウンロードができます。続けて使いたい場合は、ベレネッツにご相談ください。" };
    case "advisor":
      return { key: "trust", title: "体験価値を磨く", body: "完成した提供価値シートの見直しと、営業トーク・価格説明・Webへの展開を、面談で一緒に進めます。" };
    case "locked":
      return { key: "", title: "シートのダウンロード", body: "編集できる期間は終わりました。これまでに作った提供価値シートは、Excelでダウンロードできます。続けて使いたい場合は、ベレネッツにお問い合わせください。" };
    case "cancelled":
      return { key: "", title: "ご契約は終了しています", body: "シートの内容が必要な場合は、ベレネッツにご連絡ください。確認のうえ、一定の期間、提供価値シートをダウンロードできるようにします。" };
    default:
      return { key: "", title: "準備中", body: "ベレネッツからの案内をお待ちください。" };
  }
}

/**
 * 3〜5週目は STEP 3〜6 を順に進める。状態だけでは「いまどこか」が決まらないので、
 * 各ステップの終わりの条件（次へボタンの条件と同じ考え方）を見て、まだ終わっていない一番手前を返す。
 */
export function week35Step(done: { brakes: boolean; counter: boolean; trust: boolean; litmus: boolean }) {
  if (!done.brakes) return { key: "brakes", title: "お客様のブレーキ", body: "お客様が御社を選ぶのをためらう理由（不信・不要・不適・不急）を、残した組ごとに書き出す段階です。4種類そろうと次に進めます。" };
  if (!done.counter) return { key: "counter", title: "ブレーキを外す", body: "書き出したブレーキに、一つずつ先回りの答えをつける段階です。すべてのブレーキに答えがそろうと次に進めます。" };
  if (!done.trust) return { key: "trust", title: "体験価値を磨く", body: "残した組に「なぜなら」（実現している根拠）を足して、三連にする段階です。すべての組に「なぜなら」が入ると次に進めます。" };
  if (!done.litmus) return { key: "litmus", title: "選ばれる理由の見極め", body: "残した言葉が本当に選ばれる理由になるかを、2問と◎○△×で見極める段階です。" };
  return { key: "litmus", title: "選ばれる理由の見極め", body: "すべての組を見極めました。確認セッション②で、ベレネッツと一緒に残す言葉の順位を決めます。日程はベレネッツからご連絡します。" };
}

