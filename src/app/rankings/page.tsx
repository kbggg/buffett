import Link from "next/link";
import { getNicknameRankings } from "@/lib/queries";
import { getNickname } from "@/lib/nickname";

export const dynamic = "force-dynamic"; // 닉네임/포트폴리오 즉시 반영

const MILLION = 1_000_000;
const BILLION = 100_000_000;

function fmtMoney(v: number): string {
  if (Math.abs(v) >= BILLION) return `${(v / BILLION).toFixed(2)}억`;
  if (Math.abs(v) >= MILLION) return `${(v / MILLION).toFixed(1)}M`;
  return `${Math.round(v).toLocaleString()}원`;
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
}

export default async function Page() {
  const [rankings, currentNickname] = await Promise.all([
    getNicknameRankings(),
    getNickname(),
  ]);

  return (
    <div className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← Today
        </Link>

        <header>
          <h1 className="text-xl font-bold sm:text-2xl">🏆 닉네임 랭킹</h1>
          <p className="mt-1 text-xs text-zinc-500 sm:text-sm dark:text-zinc-400">
            평가손익률 (현재 평가 vs 매수 원금) 순. 5분 캐시.
          </p>
        </header>

        {rankings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500">아직 등록된 포트폴리오가 없습니다.</p>
          </div>
        ) : (
          <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                    <th className="px-4 py-3 text-center">#</th>
                    <th className="px-4 py-3">닉네임</th>
                    <th className="px-4 py-3 text-right">평가손익률</th>
                    <th className="px-4 py-3 text-right">평가손익</th>
                    <th className="px-4 py-3 text-right">실현손익</th>
                    <th className="px-4 py-3 text-right">총 자산</th>
                    <th className="px-4 py-3 text-right">현금</th>
                    <th className="px-4 py-3 text-center">보유</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((r, i) => {
                    const isMe = r.nickname === currentNickname;
                    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
                    return (
                      <tr
                        key={r.nickname}
                        className={
                          "border-b border-zinc-100 dark:border-zinc-900 " +
                          (isMe ? "bg-emerald-50 dark:bg-emerald-950/20" : "")
                        }
                      >
                        <td className="px-4 py-3 text-center text-sm font-bold tabular-nums">
                          {medal || i + 1}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="font-medium">{r.nickname}</span>
                          {isMe && <span className="ml-1.5 text-xs text-emerald-600">(나)</span>}
                        </td>
                        <td
                          className={
                            "px-4 py-3 text-right text-base font-bold tabular-nums " +
                            (r.pnlPct > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : r.pnlPct < 0
                                ? "text-rose-600 dark:text-rose-400"
                                : "")
                          }
                        >
                          {r.totalBuy > 0 ? fmtPct(r.pnlPct) : "-"}
                        </td>
                        <td
                          className={
                            "px-4 py-3 text-right text-xs tabular-nums " +
                            (r.pnl > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : r.pnl < 0
                                ? "text-rose-600 dark:text-rose-400"
                                : "")
                          }
                        >
                          {r.totalBuy > 0 ? fmtMoney(r.pnl) : "-"}
                        </td>
                        <td
                          className={
                            "px-4 py-3 text-right text-xs tabular-nums " +
                            (r.realized > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : r.realized < 0
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-zinc-500")
                          }
                        >
                          {r.realized !== 0 ? fmtMoney(r.realized) : "-"}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-medium tabular-nums">
                          {fmtMoney(r.totalAssets)}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-zinc-500 tabular-nums">
                          {fmtMoney(r.cash)}
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-zinc-500 tabular-nums">
                          {r.positions}종목
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <footer className="text-xs text-zinc-500 dark:text-zinc-400">
          ⓘ <strong>평가손익률</strong>: 보유 종목의 (현재가 - 매수가) / 매수가. 매수 종목 0이면 표시 안 됨.
          <strong> 실현손익</strong>: 청산 완료된 종목의 누적 손익. <strong>총 자산</strong>: 평가액 + 현금.
        </footer>
      </div>
    </div>
  );
}
