import { Geist } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata = {
  title: "超星 AI 校园 OS",
  description: "面向校园场景的统一 AI 工作台与校园操作系统入口",
  icons: {
    icon: "/chaoxing-logo-mark.svg",
    shortcut: "/chaoxing-logo-mark.svg",
    apple: "/chaoxing-logo-mark.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body className={geistSans.variable}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
