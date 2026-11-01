import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/components/auth-provider";
import { AppHeader } from "@/components/app-header";

export const metadata: Metadata = {
  title: "素材工坊 · 灵感模板库",
  description: "浏览创意模板，为你的图片寻找新的表达。",
  icons: { icon: "/mark.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body><AppProviders><AppHeader />{children}</AppProviders></body>
    </html>
  );
}
