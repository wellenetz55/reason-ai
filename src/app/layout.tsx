import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "選ばれる理由AI",
  description: "提供価値シートを8週間で完成させ、接点に展開する",
};

const FONTS =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Inter:wght@400;500;600&display=swap";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
