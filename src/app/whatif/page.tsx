import Link from "next/link";
import {
  getBacktestById,
  getBacktestHistory,
  getKospiSeries,
  getLatestBacktest,
  getStockNames,
} from "@/lib/queries";
import { BacktestChart } from "@/components/backtest-chart";

const TRILLION = 1_000_000_000_000;
const BILLION = 100_000_000;
const MILLION = 1_000_000;

function fmtMoney(v: number): string {
  if (Math.abs(v) >= TRILLION) return `${(v / TRILLION).toFixed(2)}조`;
  if (Math.abs(v) >= BILLION) return `${(v / BILLION).toFixed(2)}억`;
  if (Math.abs(v) >= MILLION) return `${(v / MILLION).toFixed(1)}M`;
  return `${Math.round(v).toLocaleString()}원`;
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const run = id ? await getBacktestById(Number(id)) : await getLatestBacktest();
  const history = await getBacktestHistory(10);

  if (!run) {
    return (
      <div className="flex-1 px-4 py-10">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-2xl font-bold">백테스트 결과 없음</h1>
          <p className="mt-3 text-sm text-zinc-500">
            먼저 백테스트를 실행하세요:{" "}
            <code className="rounded bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800">
              cd scripts && uv run python -m analysis.backtest --save
            </code>
          </p>
          <Link href="/" className="mt-6 inline-block text-sm text-emerald-600 hover:underline">
            ← Today
          </Link>
        </div>
      </div>
    );
  }

  // KOSPI 시계열 + 시스템 NAV → 누적 수익률 동시 차트용 데이터
  const kospi = await getKospiSeries(run.startDate, run.endDate);
  const kospiStart = kospi[0]?.close ?? 1;
  const kospiByDate = new Map(kospi.map((p) => [p.date, p.close / kospiStart - 1]));

  // 시스템 NAV → 누적 수익률
  const navByDate = new Map(
    run.portfolioHistory.map((s) => [s.date, s.nav / run.initialCapital - 1]),
  );

  // 두 시리즈를 같은 date set으로 정렬 (시스템 rebalance dates 기준)
  const chartData = run.portfolioHistory.map((s) => {
    // KOSPI는 그 날짜에 정확히 없을 수 있음 (휴장) — 가장 가까운 거래일
    let kospiRet = kospiByDate.get(s.date);
    if (kospiRet === undefined) {
      // 가장 가까운 prev kospi 찾기
      const sorted = kospi.filter((p) => p.date <= s.date);
      kospiRet = sorted.length > 0 ? sorted[sorted.length - 1].close / kospiStart - 1 : 0;
    }
    return {
      date: s.date,
      ours: navByDate.get(s.date) ?? 0,
      kospi: kospiRet,
    };
  });

  // 마지막 거래들 + 종목명 매핑
  const recentTrades = run.trades.slice(-15).reverse();
  const tickersInTrades = Array.from(new Set(run.trades.map((t) => t.ticker)));
  const nameByTicker = await getStockNames(tickersInTrades);

  return (
    <div className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ← Today
          </Link>
          <Link
            href="/whatif/new"
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            + 새 백테스트
          </Link>
        </div>

        <header className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-2xl font-bold">What If — 시스템 따랐다면?</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {run.startDate} ~ {run.endDate} · 초기자본 {fmtMoney(run.initialCapital)} ·{" "}
            {run.rebalanceFrequency === "monthly" ? "월별" : "분기별"} 리밸런싱 ·{" "}
            최대 {run.maxPositions}종목 · 거래비용 {(run.txCost * 100).toFixed(2)}%
          </p>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              label="최종 자산"
              value={run.finalValue !== null ? fmtMoney(run.finalValue) : "-"}
            />
            <Stat
              label="시스템 수익률"
              value={run.totalReturn !== null ? fmtPct(run.totalReturn) : "-"}
              positive={run.totalReturn !== null && run.totalReturn > 0}
              negative={run.totalReturn !== null && run.totalReturn < 0}
            />
            <Stat
              label="KOSPI 수익률"
              value={run.kospiReturn !== null ? fmtPct(run.kospiReturn) : "-"}
            />
            <Stat
              label="초과 수익"
              value={run.outperformance !== null ? `${fmtPct(run.outperformance)}p` : "-"}
              positive={run.outperformance !== null && run.outperformance > 0}
              negative={run.outperformance !== null && run.outperformance < 0}
            />
          </div>
        </header>

        <BacktestChart data={chartData} />

        <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-base font-bold">
            거래 history (최근 15건 / 총 {run.totalTrades})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                  <th className="py-2">날짜</th>
                  <th className="py-2">종목</th>
                  <th className="py-2 text-center">매수/매도</th>
                  <th className="py-2 text-right">수량</th>
                  <th className="py-2 text-right">가격</th>
                  <th className="py-2 text-right">거래비용</th>
                </tr>
              </thead>
              <tbody>
                {recentTrades.map((t, i) => (
                  <tr key={i} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="py-1.5 tabular-nums text-xs">{t.date}</td>
                    <td className="py-1.5 text-xs">
                      <Link href={`/stock/${t.ticker}`} className="hover:underline">
                        <span className="font-medium">{nameByTicker[t.ticker] ?? "-"}</span>
                        <span className="ml-1.5 font-mono text-zinc-400">{t.ticker}</span>
                      </Link>
                    </td>
                    <td className="py-1.5 text-center">
                      <span
                        className={
                          "inline-block rounded px-2 py-0.5 text-xs font-medium " +
                          (t.action === "BUY"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300")
                        }
                      >
                        {t.action === "BUY" ? "매수" : "매도"}
                      </span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{t.qty.toLocaleString()}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {Math.round(t.price).toLocaleString()}원
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-xs text-zinc-500">
                      {Math.round(t.cost).toLocaleString()}원
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {history.length > 1 && (
          <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-4 text-base font-bold">백테스트 history (최근 10건)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                    <th className="py-2">실행</th>
                    <th className="py-2">기간</th>
                    <th className="py-2 text-center">주기</th>
                    <th className="py-2 text-right">N</th>
                    <th className="py-2 text-right">시스템</th>
                    <th className="py-2 text-right">KOSPI</th>
                    <th className="py-2 text-right">초과</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => {
                    const isCurrent = run?.id === h.id;
                    return (
                      <tr
                        key={h.id}
                        className={
                          "border-b border-zinc-100 dark:border-zinc-900 " +
                          (isCurrent ? "bg-emerald-50 dark:bg-emerald-950/20" : "")
                        }
                      >
                        <td className="py-1.5 text-xs">
                          <Link href={`/whatif?id=${h.id}`} className="hover:underline">
                            #{h.id} {isCurrent && "← 현재"}
                          </Link>
                        </td>
                        <td className="py-1.5 text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                          {h.startDate}~{h.endDate}
                        </td>
                        <td className="py-1.5 text-center text-xs">
                          {h.rebalanceFrequency === "monthly" ? "월" : "분기"}/{h.maxPositions}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-xs">{h.maxPositions}</td>
                        <td className="py-1.5 text-right tabular-nums text-xs">
                          {h.totalReturn !== null ? fmtPct(h.totalReturn) : "-"}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-xs text-zinc-500">
                          {h.kospiReturn !== null ? fmtPct(h.kospiReturn) : "-"}
                        </td>
                        <td
                          className={
                            "py-1.5 text-right tabular-nums text-xs font-medium " +
                            (h.outperformance !== null && h.outperformance > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : h.outperformance !== null && h.outperformance < 0
                                ? "text-rose-600 dark:text-rose-400"
                                : "")
                          }
                        >
                          {h.outperformance !== null ? fmtPct(h.outperformance) : "-"}
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
          ⚠️ 데이터 한계: 현재 financials는 Y2025+Y2024 정상 + Y2023 부분(~37%). Y2022/Y2021 backfill 후 5년 백테스트 가능.
        </footer>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  const colorClass = positive
    ? "text-emerald-600 dark:text-emerald-400"
    : negative
      ? "text-rose-600 dark:text-rose-400"
      : "text-zinc-900 dark:text-zinc-100";
  return (
    <div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${colorClass}`}>{value}</p>
    </div>
  );
}
