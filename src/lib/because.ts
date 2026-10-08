/** なぜなら（根拠）の3分類。分類名と一行だけ（詳細な手法表は DB の method_techniques kind='because'） */
export const BECAUSE_TYPES = [
  { key: "systematic", label: "体系的な根拠", hint: "独自のプロセス・技術・素材・認証・試験" },
  { key: "perceived", label: "知覚される根拠", hint: "専門性・規模・実績の数字・顧客の声・第三者の裏づけ" },
  { key: "created", label: "生み出された根拠", hint: "差別化要因・価格体系・保証・組織体制・新しいやり方" },
] as const;

/** 「根拠なしの約束」の型（ふわっと診断でも使う） */
export const PROMISE_ONLY = ["信頼できるパートナー", "最後までやり遂げ", "期待以上", "全力で", "真心", "責任を持って", "お客様のために", "大切にし", "寄り添", "誠心誠意"];
