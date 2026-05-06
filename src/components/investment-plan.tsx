"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const TX_COST = 0.004; // 보수적 0.4%

function readCookie(name: string): string {
  if (typeof document === "undefined") return "me";
  const m = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[2]) : "me";
}

export type PlanCandidate = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  currentPrice: number; // 직전 거래일 종가
  buffettScore: number;
  marginOfSafety: number;
};

export type SellSignal = {
  positionId: number;
  ticker: string;
  name: string;
  action: "SELL_URGENT" | "SELL_REVIEW" | "RANK_DROP";
  reason: string;
  buyPrice: number;
  currentPrice: number | null;
  pnlPct: number | null;
};

const SELL_LABEL: Record<SellSignal["action"], string> = {
  SELL_URGENT: "🔴 긴급",
  SELL_REVIEW: "🟠 검토",
  RANK_DROP: "🟡 이탈",
};

const SELL_COLOR: Record<SellSignal["action"], string> = {
  SELL_URGENT:
    "border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40",
  SELL_REVIEW:
    "border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/40",
  RANK_DROP:
    "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40",
};

function fmt(v: number): string {
  return v.toLocaleString();
}

export function InvestmentPlan({
  candidates,
  sellSignals = [],
}: {
  candidates: PlanCandidate[];
  sellSignals?: SellSignal[];
}) {
  const router = useRouter();
  const [capital, setCapital] = useState<number>(1_000_000);
  const [hydrated, setHydrated] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registerErr, setRegisterErr] = useState<string | null>(null);
  const [registerOk, setRegisterOk] = useState(false);

  const [nickname, setNickname] = useState("me");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNickname(readCookie("buffett-nickname"));
  }, []);
  const storageKey = `buffett.investment.capital:${nickname}`;

  useEffect(() => {
    if (!nickname) return;
    const saved = localStorage.getItem(storageKey);
    /* eslint-disable react-hooks/set-state-in-effect */
    if (saved) setCapital(Number(saved));
    else setCapital(1_000_000);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [nickname, storageKey]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(storageKey, String(capital));
  }, [capital, hydrated, storageKey]);

  const hasSells = sellSignals.length > 0;
  const hasBuys = candidates.length > 0;

  const N = candidates.length;
  const perStock = N > 0 ? capital / N : 0;
  const allocations = candidates.map((c) => {
    const grossPerPosition = perStock / (1 + TX_COST);
    const qty = Math.floor(grossPerPosition / c.currentPrice);
    const gross = qty * c.currentPrice;
    const cost = gross * TX_COST;
    const total = gross + cost;
    return { ...c, qty, gross, cost, total };
  });
  const sumTotal = allocations.reduce((s, a) => s + a.total, 0);
  const sumGross = allocations.reduce((s, a) => s + a.gross, 0);
  const sumCost = allocations.reduce((s, a) => s + a.cost, 0);
  const leftover = capital - sumTotal;
  const utilization = capital > 0 ? sumTotal / capital : 0;
  const minPossible = candidates.length
    ? Math.min(...candidates.map((c) => c.currentPrice * (1 + TX_COST)))
    : 0;
  const noBuyable = hasBuys && allocations.every((a) => a.qty === 0);

  // 매도 + 매수 둘 다 없으면 안내만
  if (!hasSells && !hasBuys) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
        <h2 className="text-base font-bold text-amber-900 dark:text-amber-200">
          🎯 오늘의 액션
        </h2>
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
          매도 신호 없음. 3중 통과 매수후보도 없음 — 오늘은 관망.
        </p>
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          가치통과 종목은 있을 수 있습니다 — 아래 &quot;가치통과&quot; 탭 확인.
        </p>
      </section>
    );
  }

  const sumSellValue = sellSignals.reduce(
    (s, x) => s + (x.currentPrice ?? 0),
    0,
  );
  const urgent = sellSignals.filter((s) => s.action === "SELL_URGENT").length;
  const review = sellSignals.filter((s) => s.action === "SELL_REVIEW").length;
  const rankDrop = sellSignals.filter((s) => s.action === "RANK_DROP").length;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            🎯 오늘의 액션
          </h2>
          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
            {[
              hasSells &&
                `매도 ${sellSignals.length}건 (${[
                  urgent && `긴급 ${urgent}`,
                  review && `검토 ${review}`,
                  rankDrop && `이탈 ${rankDrop}`,
                ]
                  .filter(Boolean)
                  .join("·")})`,
              hasBuys && `매수 ${N}종목 균등 분배`,
            ]
              .filter(Boolean)
              .join(" → ")}
            <span className="ml-1.5 text-[10px] text-zinc-400">
              · 거래비용 {(TX_COST * 100).toFixed(1)}% 반영
            </span>
          </p>
        </div>
      </div>

      {/* === 매도 섹션 === */}
      {hasSells && (
        <div className="mt-4">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              먼저 매도 검토
            </h3>
            <Link
              href="/portfolio"
              className="text-[11px] text-zinc-500 underline-offset-2 hover:underline"
            >
              Portfolio →
            </Link>
          </div>
          <div className="space-y-1.5">
            {sellSignals.slice(0, 5).map((s) => {
              const pnl = s.pnlPct ?? 0;
              return (
                <Link
                  key={s.positionId}
                  href={`/stock/${s.ticker}`}
                  className={`flex flex-col gap-1 rounded-lg border px-3 py-2 hover:opacity-80 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${SELL_COLOR[s.action]}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-[11px] font-bold">
                        {SELL_LABEL[s.action]}
                      </span>
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {s.name}
                      </span>
                      <span className="text-[10px] text-zinc-500">{s.ticker}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-zinc-700 dark:text-zinc-300">
                      {s.reason}
                    </p>
                  </div>
                  <div className="flex items-baseline gap-2 text-[11px] tabular-nums sm:flex-col sm:items-end sm:gap-0">
                    <p className="text-zinc-500">
                      {fmt(Math.round(s.buyPrice))} →{" "}
                      {s.currentPrice ? fmt(Math.round(s.currentPrice)) : "-"}
                    </p>
                    <p
                      className={
                        "font-bold " +
                        (pnl > 0
                          ? "text-emerald-700 dark:text-emerald-300"
                          : pnl < 0
                            ? "text-rose-700 dark:text-rose-300"
                            : "")
                      }
                    >
                      {pnl > 0 ? "+" : ""}
                      {(pnl * 100).toFixed(1)}%
                    </p>
                  </div>
                </Link>
              );
            })}
            {sellSignals.length > 5 && (
              <p className="text-[11px] text-zinc-500">
                외 {sellSignals.length - 5}종목 — Portfolio에서 일괄 매도 가능
              </p>
            )}
            {sumSellValue > 0 && (
              <p className="mt-2 text-[11px] text-zinc-500">
                💡 매도 시 회수 추정 ≈ {fmt(Math.round(sumSellValue))}원 (현재가
                기준, 거래비용/세금 미반영). 회수 후 아래 매수 자본에 반영하세요.
              </p>
            )}
          </div>
        </div>
      )}

      {/* === 매수 섹션 === */}
      {hasBuys && (
        <div className={hasSells ? "mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800" : "mt-4"}>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              매수 — {N}종목 균등 분배
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <label className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
              투자 가능 금액:
            </label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={100_000}
                value={capital}
                onChange={(e) => setCapital(Math.max(0, Number(e.target.value)))}
                className="w-32 rounded-lg border border-emerald-300 bg-white px-2 py-1.5 text-right text-sm font-medium tabular-nums sm:w-40 sm:px-3 dark:border-emerald-800 dark:bg-zinc-900"
              />
              <span className="text-sm text-emerald-700 dark:text-emerald-400">원</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {[1_000_000, 5_000_000, 10_000_000, 50_000_000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setCapital(v)}
                  className="rounded border border-emerald-300 bg-white px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-950"
                >
                  {v >= 100_000_000 ? `${v / 100_000_000}억` : `${v / 1_000_000}M`}
                </button>
              ))}
            </div>
          </div>

          {noBuyable ? (
            <p className="mt-4 rounded-lg bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              ⚠️ 투자금 부족. 최소 {fmt(Math.ceil(minPossible))}원 이상 필요 (1주 매수가).
            </p>
          ) : (
            <>
              <div className="mt-4 -mx-1 overflow-x-auto px-1">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-emerald-200 text-left text-[11px] text-emerald-700 dark:border-emerald-900/50 dark:text-emerald-400">
                      <th className="py-2">종목</th>
                      <th className="py-2 text-right">현재가</th>
                      <th className="py-2 text-right">수량</th>
                      <th className="py-2 text-right">매수액</th>
                      <th className="hidden py-2 text-right sm:table-cell">거래비용</th>
                      <th className="py-2 text-right">합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((a) => (
                      <tr
                        key={a.ticker}
                        className="border-b border-emerald-100 last:border-0 dark:border-emerald-900/30"
                      >
                        <td className="py-2 text-xs">
                          <Link href={`/stock/${a.ticker}`} className="hover:underline">
                            <span className="font-medium text-zinc-900 dark:text-zinc-100">
                              {a.name}
                            </span>
                            <span className="ml-1.5 font-mono text-[10px] text-zinc-400">
                              {a.ticker}
                            </span>
                          </Link>
                          <p className="text-[10px] text-zinc-500">
                            S {a.buffettScore.toFixed(0)} · MoS{" "}
                            +{(a.marginOfSafety * 100).toFixed(0)}%
                          </p>
                        </td>
                        <td className="py-2 text-right text-xs tabular-nums">
                          {fmt(Math.round(a.currentPrice))}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          <span className="font-bold">{a.qty}</span>
                          <span className="ml-0.5 text-[10px] text-zinc-500">주</span>
                        </td>
                        <td className="py-2 text-right text-xs tabular-nums">
                          {fmt(a.gross)}
                        </td>
                        <td className="hidden py-2 text-right text-xs tabular-nums text-zinc-500 sm:table-cell">
                          {fmt(Math.round(a.cost))}
                        </td>
                        <td className="py-2 text-right text-xs font-medium tabular-nums">
                          {fmt(Math.round(a.total))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-emerald-300 font-medium dark:border-emerald-800">
                      <td className="py-2 text-sm">합계</td>
                      <td className="py-2"></td>
                      <td className="py-2"></td>
                      <td className="py-2 text-right text-sm tabular-nums">
                        {fmt(Math.round(sumGross))}
                      </td>
                      <td className="hidden py-2 text-right text-sm tabular-nums text-zinc-500 sm:table-cell">
                        {fmt(Math.round(sumCost))}
                      </td>
                      <td className="py-2 text-right text-sm tabular-nums">
                        {fmt(Math.round(sumTotal))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Stat label="투자 합계" value={`${fmt(Math.round(sumTotal))}원`} />
                <Stat
                  label="잔여 현금"
                  value={`${fmt(Math.round(leftover))}원`}
                  hint={`${(100 - utilization * 100).toFixed(0)}% 미사용`}
                />
                <Stat
                  label="활용률"
                  value={`${(utilization * 100).toFixed(0)}%`}
                  hint={
                    utilization < 0.7
                      ? "낮음 — 투자금 ↑"
                      : utilization > 0.97
                        ? "거의 전부 투입"
                        : "적정"
                  }
                />
              </div>

              <div className="mt-4 flex flex-col gap-2 border-t border-emerald-200 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 dark:border-emerald-900/50">
                <button
                  type="button"
                  disabled={registering || registerOk}
                  onClick={async () => {
                    if (!confirm(
                      `${allocations.filter(a => a.qty > 0).length}종목을 매수 등록하시겠습니까?\n` +
                      `합계 ${fmt(Math.round(sumTotal))}원 + 잔여 현금 ${fmt(Math.round(leftover))}원\n\n` +
                      `※ 실제 주문은 본인이 증권사 앱에서 직접 진행하세요. 이건 기록만 남깁니다.`
                    )) return;
                    setRegistering(true);
                    setRegisterErr(null);
                    try {
                      const res = await fetch("/api/portfolio/batch", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                          date: new Date().toISOString().slice(0, 10),
                          allocations: allocations
                            .filter((a) => a.qty > 0)
                            .map((a) => ({ ticker: a.ticker, qty: a.qty, price: a.currentPrice })),
                          leftover: Math.round(leftover),
                          capital,
                        }),
                      });
                      const json = await res.json();
                      if (!res.ok) throw new Error(json.error ?? "실패");
                      setRegisterOk(true);
                      setTimeout(() => router.push("/portfolio"), 800);
                    } catch (e) {
                      setRegisterErr(e instanceof Error ? e.message : String(e));
                    } finally {
                      setRegistering(false);
                    }
                  }}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {registerOk
                    ? "✓ 등록 완료 — Portfolio 이동 중..."
                    : registering
                      ? "등록 중..."
                      : "💰 이대로 매수 등록"}
                </button>
                <Link
                  href="/portfolio"
                  className="text-xs text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
                >
                  Portfolio 보기 →
                </Link>
                {registerErr && (
                  <p className="w-full text-xs text-rose-600">에러: {registerErr}</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <p className="mt-4 border-t border-zinc-200 pt-3 text-[10px] text-zinc-500 dark:border-zinc-800">
        ⚠️ 시스템 권장은 객관적 지표 기반 참고용. 실제 매수/매도는 본인 판단 + 추가 분석 필요.
        한 번에 큰 자본 투입 X — 점진적 증액. 본인이 직접 증권사 앱에서 매매 (자동매매 X).
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg bg-emerald-50 p-2.5 sm:p-3 dark:bg-emerald-950/30">
      <p className="text-[11px] text-emerald-700 dark:text-emerald-400">{label}</p>
      <p className="mt-0.5 text-base font-bold tabular-nums text-emerald-900 sm:text-lg dark:text-emerald-200">
        {value}
      </p>
      {hint && <p className="text-[10px] text-zinc-500">{hint}</p>}
    </div>
  );
}
