import Link from "next/link";
import { getNickname } from "@/lib/nickname";
import {
  getCashBalance,
  getDecisions,
  getPortfolio,
} from "@/lib/queries";
import { ProfileActions } from "@/components/profile-actions";

export const dynamic = "force-dynamic";

export default async function Page() {
  const nickname = await getNickname();
  const [positions, cash, decisions] = await Promise.all([
    getPortfolio(nickname),
    getCashBalance(nickname),
    getDecisions(nickname),
  ]);

  return (
    <div className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← Today
        </Link>

        <header>
          <h1 className="text-xl font-bold sm:text-2xl">프로필 관리 — {nickname}</h1>
          <p className="mt-1 text-xs text-zinc-500 sm:text-sm dark:text-zinc-400">
            현재 닉네임의 데이터만 다룹니다. 종목/재무/점수 같은 분석 데이터는 공유.
          </p>
        </header>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-base font-bold">현재 데이터</h2>
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3 sm:gap-4">
            <div>
              <p className="text-xs text-zinc-500">보유 종목</p>
              <p className="mt-1 text-xl font-bold tabular-nums">
                {positions.filter((p) => !p.isClosed).length}
                <span className="ml-1 text-xs text-zinc-400">/{positions.length} (포함 청산)</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">현금 entries</p>
              <p className="mt-1 text-xl font-bold tabular-nums">
                {cash.entries.length}
                <span className="ml-1 text-xs text-zinc-400">건</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">결정 로그</p>
              <p className="mt-1 text-xl font-bold tabular-nums">
                {decisions.length}
                <span className="ml-1 text-xs text-zinc-400">건</span>
              </p>
            </div>
          </div>
        </section>

        <ProfileActions nickname={nickname} />

        <footer className="text-xs text-zinc-500 dark:text-zinc-400">
          ⓘ 내보내기/가져오기로 다른 기기 또는 다른 시점 데이터로 백업 가능. 닉네임을 바꾸면 다른
          프로필이 됩니다 (메인 우상단 위젯).
        </footer>
      </div>
    </div>
  );
}
