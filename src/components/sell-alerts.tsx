import Link from "next/link";
import type { PortfolioPosition } from "@/lib/queries";
import { recommend } from "@/lib/recommendation";

const COLOR: Record<string, string> = {
  SELL_URGENT: "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-800",
  SELL_REVIEW: "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950/50 dark:text-orange-200 dark:border-orange-800",
  RANK_DROP: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800",
};

const LABEL: Record<string, string> = {
  SELL_URGENT: "🔴 긴급 매도",
  SELL_REVIEW: "🟠 매도 검토",
  RANK_DROP: "🟡 랭킹 이탈",
};

const SEVERITY: Record<string, number> = { SELL_URGENT: 0, SELL_REVIEW: 1, RANK_DROP: 2 };

export function SellAlerts({
  positions,
  nickname,
  topTickers,
}: {
  positions: PortfolioPosition[];
  nickname: string;
  /** 백테스트 규칙: 매수후보 상위 N (Score≥80 + MoS≥30%, score+mos 정렬). 비어있으면 랭킹 이탈 판정 X. */
  topTickers?: string[];
}) {
  const open = positions.filter((p) => !p.isClosed);
  const topSet = new Set(topTickers ?? []);

  type Signal = {
    p: PortfolioPosition;
    action: "SELL_URGENT" | "SELL_REVIEW" | "RANK_DROP";
    reason: string;
  };

  const signals: Signal[] = [];
  for (const p of open) {
    const rec = recommend({
      buffettScore: p.buffettScore,
      marginOfSafety: p.marginOfSafety,
      timingSignal: p.timingSignal,
      intrinsicAvg: p.intrinsicAvg,
      recentNegativeEvents: p.recentNegativeEvents,
      isHolding: true,
      buyPrice: p.buyPrice,
    });
    if (rec.action === "SELL_URGENT" || rec.action === "SELL_REVIEW") {
      signals.push({ p, action: rec.action, reason: rec.reason });
    } else if (topTickers && topTickers.length > 0 && !topSet.has(p.ticker)) {
      // 백테스트와 동일: 보유 중인데 매수후보 상위에서 빠짐 → 매도 검토
      signals.push({
        p,
        action: "RANK_DROP",
        reason: `매수후보 상위 ${topTickers.length}에서 이탈 — 분기 리밸런스 시 교체 대상`,
      });
    }
  }
  signals.sort((a, b) => SEVERITY[a.action] - SEVERITY[b.action]);

  if (signals.length === 0) return null;

  const urgent = signals.filter((s) => s.action === "SELL_URGENT").length;
  const review = signals.filter((s) => s.action === "SELL_REVIEW").length;
  const rankDrop = signals.filter((s) => s.action === "RANK_DROP").length;
  const hasUrgent = urgent > 0 || review > 0;

  // 가장 심각한 신호에 따라 박스 톤 결정
  const boxClass = hasUrgent
    ? "border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30"
    : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30";
  const titleClass = hasUrgent
    ? "text-rose-900 dark:text-rose-200"
    : "text-amber-900 dark:text-amber-200";
  const subClass = hasUrgent
    ? "text-rose-700 dark:text-rose-300"
    : "text-amber-700 dark:text-amber-300";

  return (
    <section className={`rounded-xl border-2 p-5 ${boxClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={`text-base font-bold ${titleClass}`}>
            ⚠️ 매도 신호 — {signals.length}종목 ({nickname})
          </h2>
          <p className={`mt-1 text-xs ${subClass}`}>
            {[
              urgent > 0 && `긴급 매도 ${urgent}`,
              review > 0 && `매도 검토 ${review}`,
              rankDrop > 0 && `랭킹 이탈 ${rankDrop}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Link
          href="/portfolio"
          className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white ${
            hasUrgent ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"
          }`}
        >
          Portfolio →
        </Link>
      </div>

      <div className="mt-4 space-y-2">
        {signals.slice(0, 5).map(({ p, action, reason }) => {
          const pnlPct = p.pnlPct ?? 0;
          return (
            <Link
              key={p.id}
              href={`/stock/${p.ticker}`}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 hover:opacity-80 ${COLOR[action]}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold">{LABEL[action]}</span>
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs opacity-60">{p.ticker}</span>
                </div>
                <p className="mt-0.5 text-xs opacity-80">{reason}</p>
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
          <p className={`text-xs ${subClass}`}>
            외 {signals.length - 5}종목 — Portfolio에서 전체 확인
          </p>
        )}
      </div>
    </section>
  );
}
