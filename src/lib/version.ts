import pkg from "../../package.json";
// 表示は v<major>.<minor>。修正ごとに minor を +1 する（CLAUDE.md 参照）
export const APP_VERSION = "v" + pkg.version.split(".").slice(0, 2).join(".");
