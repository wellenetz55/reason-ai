/**
 * サインイン画面に出すエラーの文。URLには短い記号（?e=expired など）だけを載せ、文はここで決める。
 * URLに書いた文をそのまま出すと、正規のドメインの上で好きな文（偽の案内）を見せられてしまうため。
 */
export const LOGIN_ERRORS = {
  expired: "リンクが無効か、有効期限（5分）が過ぎています。メールを受け取った端末とは別のブラウザで開いた場合も無効になります。もう一度メールアドレスを入力してください。",
  noemail: "メールアドレスを入力してください",
  busy: "ただいま混み合っています。1分ほど待ってから、もう一度お試しください。",
  noprofile: "アカウント設定が完了していません。ベレネッツにお問い合わせください。",
  disabled: "このアカウントは使えなくなっています。",
  nocompany: "会社が紐づいていません。",
} as const;
export type LoginErrorCode = keyof typeof LOGIN_ERRORS;
export const loginErrorUrl = (code: LoginErrorCode) => `/login?e=${code}`;
