/** 描画前にクッキーの選択を <html> に入れる（ちらつき防止）。未設定はライト */
export const THEME_SCRIPT = `try{var m=document.cookie.match(/(?:^|; )theme=(dark|system|light)/);document.documentElement.dataset.theme=m?m[1]:"light"}catch(e){}`;
