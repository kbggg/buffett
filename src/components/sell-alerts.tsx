import Link from "next/link";
import type { PortfolioPosition } from "@/lib/queries";
import { recommend } from "@/lib/recommendation";

const COLOR: Record<string, string> = {
  SELL_URGENT: "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-800",
  SELL_REVIEW: "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950/50 dark:text-orange-200 dark:border-orange-800",
};

const LABEL: Record<string, string> = {
  SELL_URGENT: "🔴 긴급 매도",
  SELL_REVIEW: "🟠 매도 검토",
};

export function SellAlerts({
  positions,
  nickname,
}: {
  positions: PortfolioPosition[];
  nickname: string;
}) {
  const open = positions.filter((p) => !p.isClosed);
  const signals = open
    .map((p) => ({
      p,
      rec: recommend({
        buffettScore: p.buffettScore,
        marginOfSafety: p.marginOfSafety,
        timingSignal: p.timingSignal,
        intrinsicAvg: p.intrinsicAvg,
        recentNegativeEvents: p.recentNegativeEvents,
        isHolding: true,
        buyPrice: p.buyPrice,
      }),
    }))
    .filter(({ rec }) => rec.action === "SELL_REVIEW" || rec.action === "SELL_URGENT")
    .sort((a, b) => (a.rec.action === "SELL_URGENT" ? -1 : 1));

  if (signals.length === 0) return null;

  const urgent = signals.filter((s) => s.rec.action === "SELL_URGENT").length;
  const review = signals.filter((s) => s.rec.action === "SELL_REVIEW").length;

  return (
    <section className="rounded-xl border-2 border-rose-300 bg-rose-50 p-5 dark:border-rose-800 dark:bg-rose-950/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-rose-900 dark:text-rose-200">
            ⚠️ 매도 신호 — {signals.length}종목 ({nickname})
          </h2>
          <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
            {urgent > 0 && `긴급 매도 ${urgent}종목`}
            {urgent > 0 && review > 0 && " · "}
            {review > 0 && `매도 검토 ${review}종목`}
          </p>
        </div>
        <Link
          href="/portfolio"
          className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700"
        >
          Portfolio →
        </Link>
      </div>

      <div className="mt-4 space-y-2">
        {signals.slice(0, 5).map(({ p, rec }) => {
          const pnlPct = p.pnlPct ?? 0;
          return (
            <Link
              key={p.id}
              href={`/stock/${p.ticker}`}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 hover:opacity-80 ${COLOR[rec.action]}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold">{LABEL[rec.action]}</span>
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs opacity-60">{p.ticker}</span>
                </div>
                <p className="mt-0.5 text-xs opacity-80">{rec.reason}</p>
              </div>
              <div className="text-right text-xs tabular-nums">
                <p className="text-zinc-600 dark:text-zinc-400">
                  매수 {Math.round(p.buyPrice).toLocaleString()} → 현재{" "}
                  {p.currentPrice ? Math.round(p.currentPrice).toLocaleString() : "-"}
                </p>
                <p
                  className={
                    "font-bold " +
                    (pnlPct > 0
                      ? "text-emerald-700 dark:text-emerald-300"
                      : pnlPct < 0
                        ? "text-rose-700 dark:text-rose-300"
                        : "")
                  }
                >
                  {pnlPct > 0 ? "+" : ""}
                  {(pnlPct * 100).toFixed(1)}%
                </p>
              </div>
            </Link>
          );
        })}
        {signals.length > 5 && (
          <p className="text-xs text-rose-700 dark:text-rose-400">
            외 {signals.length - 5}종목 — Portfolio에서 전체 확인
          </p>
        )}
      </div>
    </section>
  );
}
