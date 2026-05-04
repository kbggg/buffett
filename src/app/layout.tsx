import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getNickname } from "@/lib/nickname";
import { NicknameSwitcher } from "@/components/nickname-switcher";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Buffett — 가치투자 종목 추천",
  description:
    "워렌 버핏 가치투자 원칙으로 한국 시장(KOSPI) 우량 저평가 종목을 추리는 개인용 의사결정 도구.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nickname = await getNickname();
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 sm:px-8">
            <Link href="/" className="text-sm font-bold tracking-tight">
              Buffett
            </Link>
            <NicknameSwitcher current={nickname} />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
