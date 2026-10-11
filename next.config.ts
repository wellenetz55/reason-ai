import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  partialPrefetching: true,
  // 他サイトへの埋め込み（クリックジャッキング）を防ぐなどの基本ヘッダ
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  // 旧URL（*.vercel.app）で開かれたら独自ドメインへ転送。お客様に渡した古いリンクを切らさない
  async redirects() {
    const app = process.env.NEXT_PUBLIC_APP_URL;
    if (!app || !app.includes("wellenetz.co.jp")) return [];
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "reason-ai-w3eu.vercel.app" }],
        destination: `${app}/:path*`,
        permanent: true,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
