import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "StarRevenue Platform",
  description: "StarRevenue Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}