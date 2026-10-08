export type Stage = {
  key: string;
  step: string; // "STEP 1" など。左メニューのラベル
  label: string;
  href: string;
  guide: { lead: string; body: string }; // 各段階の画面に必ず出す平易な説明（ELI5）
  statuses: string[]; // company statuses in which this stage is open
};

export const STAGES: Stage[] = [
  { key: "step0", guide: { lead: "まず、御社のことをAIに教える段階です。", body: "会社案内やWebサイトを登録すると、AIが「御社はこういう会社です」という説明を下書きします。合っているところは残し、違うところを直してください。ここが土台になるので、丁寧に直すほど後の段階がラクになります。" }, step: "STEP 0", label: "会社を知る", href: "/step0", statuses: ["onboarding", "week1_2", "week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "diverge", guide: { lead: "御社が「できること」を、思いつくまま全部書き出す段階です。", body: "良い悪いは考えません。小さいこと、当たり前だと思うことも全部出します。目標は30行。毎日ちがう角度の問いが出るので、それに答えるだけで行が増えていきます。詰まったらAIに下書きを頼めます。" }, step: "STEP 1", label: "提供価値を出す", href: "/sheet/diverge", statuses: ["week1_2", "week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "merge", guide: { lead: "たくさん出した行を、似たものどうしでまとめて、残す言葉を選ぶ段階です。", body: "「同じことを言っている行」を一つにして、本当に御社らしいものだけを残します。消すのではなく「保留」にするので、あとで戻せます。最後に2つの簡単な質問で、絞り方が合っているか確かめます。" }, step: "STEP 2", label: "まとめて絞る", href: "/sheet/merge", statuses: ["week1_2", "week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "brakes", guide: { lead: "お客様が御社を選ぶ直前に「やっぱりやめようかな」と思う理由を書き出す段階です。", body: "人は買う前に、必ず何かが引っかかります。「本当かな」「うちには必要ないかも」「合わないかも」「今じゃなくていいか」。この引っかかり＝ブレーキを先に全部出しておくと、次の段階で先回りの答えが作れます。" }, step: "STEP 3", label: "お客様のブレーキ", href: "/sheet/brakes", statuses: ["week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "counter", guide: { lead: "書き出したブレーキを、一つずつ外していく段階です。", body: "ブレーキごとに「それならこう答えます」という言葉を用意します。前の段階で出した「できること」が、ここで答えの材料になります。答えには「事実」「要確認」「仮説」の印をつけて、どこまで確かかを分けておきます。" }, step: "STEP 4", label: "ブレーキを外す", href: "/sheet/counter", statuses: ["week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "trust", guide: { lead: "お客様が「それいいね」と感じる言葉に磨く段階です。", body: "「御社は〜できる」（特徴）を、「お客様は〜と感じられる」（体験価値）に言い換えます。つなぎは「だから」。特徴→だから→体験価値、と読んで自然なら合っています。競合と並べて、御社だけが言える部分も確かめます。" }, step: "STEP 5", label: "体験価値を磨く", href: "/sheet/trust", statuses: ["week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "litmus", guide: { lead: "できあがった言葉が、本当に市場で通用するかを試す段階です。", body: "試験紙にひたすように、いくつかの決まった質問に答えて点数をつけます。点が低い言葉は、まだ磨き足りないか、思い込みが入っているサインです。ここで気づけば、あとで大きく直さずに済みます。" }, step: "STEP 6", label: "試験紙", href: "/sheet/litmus", statuses: ["week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "evidence", guide: { lead: "言葉の「裏づけ」を集める段階です。", body: "「お客様の声」「数字」「実績」など、その言葉が本当だと示せるものを探して、行ごとにつけていきます。裏づけがつくと「仮説」が「事実」に変わり、営業やWebで安心して使える言葉になります。" }, step: "STEP 7", label: "証拠を集める", href: "/sheet/evidence", statuses: ["week6_8", "extended", "grace", "advisor"] },
  { key: "deploy", guide: { lead: "完成した言葉を、営業トーク・価格の説明・Webなど、実際に使う場面の形に変える段階です。", body: "ここまでで作った提供価値シートが材料です。場面を選ぶと、その場面に合った文章の下書きが出ます。それを御社の言葉に直して、すぐ使える形にします。" }, step: "FINAL", label: "接点に展開する", href: "/deploy", statuses: ["week6_8", "extended", "grace", "advisor"] },
];

export const STATUS_LABEL: Record<string, string> = {
  diagnosed: "適合診断済み",
  onboarding: "キックオフ前",
  week1_2: "骨格をつくる（1〜2週目）",
  week3_5: "肉付けする（3〜5週目）",
  week6_8: "仕上げる（6〜8週目）",
  extended: "延長中",
  grace: "猶予期間",
  locked: "閲覧のみ",
  advisor: "顧問",
  cancelled: "解約",
};

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
        ? { key: "diverge", title: "提供価値を出す", body: `御社が「できること」を思いつく限り書き出す段階です。あと${20 - rows}行で次に進めます（目標30行）。` }
        : { key: "merge", title: "まとめて絞る", body: `提供価値が${rows}行そろいました。似たものをまとめ、残す言葉を選ぶ段階です。` };
    case "week3_5":
      return { key: "brakes", title: "お客様のブレーキを書き出す", body: "お客様が御社を選ぶ直前に感じる不安や迷いを書き出し、先回りの答えを用意する段階です。" };
    case "week6_8":
    case "extended":
      return { key: "evidence", title: "証拠を集める", body: "ここまで決めた言葉の裏づけ（お客様の声・数字・事実）を集め、営業やWebの言葉に展開する段階です。" };
    case "grace":
    case "advisor":
      return { key: "deploy", title: "接点に展開する", body: "完成した提供価値を、営業トーク・価格説明・Webなどの言葉に変換する段階です。" };
    case "locked":
      return { key: "", title: "シートの閲覧", body: "完成した提供価値シートの閲覧とダウンロードができます。" };
    default:
      return { key: "", title: "準備中", body: "ベレネッツからの案内をお待ちください。" };
  }
}
