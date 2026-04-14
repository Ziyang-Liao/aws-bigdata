import type { Metadata } from "next";
import "./globals.css";
import RootLayoutClient from "./layoutClient";

export const metadata: Metadata = {
  title: "大数据治理平台",
  description: "一站式大数据开发治理平台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
