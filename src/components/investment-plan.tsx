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

function fmt(v: number): string {
  return v.toLocaleString();
}

export function InvestmentPlan({
  candidates,
}: {
  candidates: PlanCandidate[];
}) {
  // localStorage로 투자금액 기억
  const router = useRouter();
  const [capital, setCapital] = useState<number>(1_000_000);
  const [hydrated, setHydrated] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registerErr, setRegisterErr] = useState<string | null>(null);
  const [registerOk, setRegisterOk] = useState(false);

  // 닉네임별로 별도 저장
  const [nickname, setNickname] = useState("me");
  useEffect(() => {
    setNickname(readCookie("buffett-nickname"));
  }, []);
  const storageKey = `buffett.investment.capital:${nickname}`;

  useEffect(() => {
    if (!nickname) return;
    const saved = localStorage.getItem(storageKey);
    if (saved) setCapital(Number(saved));
    else setCapital(1_000_000);
    setHydrated(true);
  }, [nickname, storageKey]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(storageKey, String(capital));
  }, [capital, hydrated, storageKey]);

  if (candidates.length === 0) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
        <h2 className="text-base font-bold text-amber-900 dark:text-amber-200">
          오늘 투자 계획
        </h2>
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
          오늘은 3중 통과(가치+안전마진+타이밍) 매수후보가 없습니다. 매수 보류 권장.
        </p>
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          가치통과 종목은 있을 수 있습니다 — 아래 &quot;가치통과&quot; 탭 확인.
        </p>
      </section>
    );
  }

  const N = candidates.length;
  const perStock = capital / N;
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
  const minPossible = Math.min(...candidates.map((c) => c.currentPrice * (1 + TX_COST)));
  const noBuyable = allocations.every((a) => a.qty === 0);

  return (
    <section className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-50/50 p-5 dark:border-emerald-900/50 dark:from-emerald-950/30 dark:to-emerald-950/10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-emerald-900 dark:text-emerald-200">
            🎯 오늘 투자 계획
          </h2>
          <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
            매수후보 {N}종목 동등 분배 · 거래비용 {(TX_COST * 100).toFixed(1)}% 반영
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
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
            className="w-40 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-right text-sm font-medium tabular-nums dark:border-emerald-800 dark:bg-zinc-900"
          />
          <span className="text-sm text-emerald-700 dark:text-emerald-400">원</span>
        </div>
        <div className="flex gap-1">
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
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-emerald-200 text-left text-xs text-emerald-700 dark:border-emerald-900/50 dark:text-emerald-400">
                  <th className="py-2">종목</th>
                  <th className="py-2 text-right">현재가</th>
                  <th className="py-2 text-right">수량</th>
                  <th className="py-2 text-right">매수액</th>
                  <th className="py-2 text-right">거래비용</th>
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
                      <Link
                        href={`/stock/${a.ticker}`}
                        className="hover:underline"
                      >
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {a.name}
                        </span>
                        <span className="ml-1.5 font-mono text-zinc-400">{a.ticker}</span>
                      </Link>
                      <p className="text-zinc-500">
                        Score {a.buffettScore.toFixed(0)} · 안전마진 +
                        {(a.marginOfSafety * 100).toFixed(0)}%
                      </p>
                    </td>
                    <td className="py-2 text-right tabular-nums text-xs">
                      {fmt(Math.round(a.currentPrice))}원
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      <span className="font-bold">{a.qty}</span>
                      <span className="ml-0.5 text-xs text-zinc-500">주</span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-xs">{fmt(a.gross)}원</td>
                    <td className="py-2 text-right tabular-nums text-xs text-zinc-500">
                      {fmt(Math.round(a.cost))}원
                    </td>
                    <td className="py-2 text-right tabular-nums text-xs font-medium">
                      {fmt(Math.round(a.total))}원
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-emerald-300 font-medium dark:border-emerald-800">
                  <td className="py-2 text-sm">합계</td>
                  <td className="py-2"></td>
                  <td className="py-2"></td>
                  <td className="py-2 text-right tabular-nums text-sm">
                    {fmt(Math.round(sumGross))}원
                  </td>
                  <td className="py-2 text-right tabular-nums text-sm text-zinc-500">
                    {fmt(Math.round(sumCost))}원
                  </td>
                  <td className="py-2 text-right tabular-nums text-sm">
                    {fmt(Math.round(sumTotal))}원
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
                  ? "낮음 — 투자금 ↑ 또는 종목 추가 시 활용률 ↑"
                  : utilization > 0.97
                    ? "거의 전부 투입"
                    : "적정"
              }
            />
          </div>

          {/* 한 번에 매수 등록 */}
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-emerald-200 pt-4 dark:border-emerald-900/50">
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

      <p className="mt-4 border-t border-emerald-200 pt-3 text-[10px] text-emerald-700 opacity-80 dark:border-emerald-900/50 dark:text-emerald-400">
        ⚠️ 시스템 권장은 객관적 지표 기반 참고용. 실제 매수는 본인 판단 + 추가 분석 필요.
        한 번에 큰 자본 투입 X — 점진적 증액. 본인이 직접 증권사 앱에서 매수 (자동매매 X).
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
    <div className="rounded-lg bg-white/60 p-3 dark:bg-zinc-900/60">
      <p className="text-xs text-emerald-700 dark:text-emerald-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-900 dark:text-emerald-200">
        {value}
      </p>
      {hint && <p className="text-[10px] text-zinc-500">{hint}</p>}
    </div>
  );
}
