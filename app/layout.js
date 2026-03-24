import { Geist } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata = {
  title: "AI校园 - 一站式智能空间",
  description: "覆盖师生全场景的一站式智能校园平台",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body className={geistSans.variable}>
        <Navbar />
        <main style={{ marginTop: 'var(--navbar-height)' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
