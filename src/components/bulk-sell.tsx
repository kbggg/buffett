"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PortfolioPosition } from "@/lib/queries";

type SellTarget = {
  position: PortfolioPosition;
  reason: string;
  urgency: "urgent" | "review";
};

export function BulkSell({ targets }: { targets: SellTarget[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sellDate, setSellDate] = useState(new Date().toISOString().slice(0, 10));
  const [prices, setPrices] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      targets.map((t) => [
        t.position.id,
        String(Math.round(t.position.currentPrice ?? t.position.buyPrice)),
      ]),
    ),
  );

  if (targets.length === 0) return null;

  const totalProceeds = targets.reduce((s, t) => {
    const p = Number(prices[t.position.id]);
    return s + (Number.isFinite(p) ? p * t.position.quantity : 0);
  }, 0);
  const totalBuy = targets.reduce(
    (s, t) => s + t.position.buyPrice * t.position.quantity,
    0,
  );
  const totalPnl = totalProceeds - totalBuy;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const sells = targets.map((t) => ({
        id: t.position.id,
        sellPrice: Number(prices[t.position.id]),
      }));
      const res = await fetch("/api/portfolio/batch-sell", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sellDate, sells }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "실패");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700"
      >
        🔴 매도 신호 {targets.length}종목 일괄 매도
      </button>
    );
  }

  return (
    <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-5 dark:border-rose-800 dark:bg-rose-950/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-rose-900 dark:text-rose-200">
            일괄 매도 — {targets.length}종목
          </h3>
          <p className="mt-1 text-xs text-rose-700 dark:text-rose-400">
            매도가 직전 거래일 종가로 자동 채움. 수정 가능. ⚠️ 실제 매도는 본인이 증권사 앱에서.
          </p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="rounded border border-rose-300 px-2 py-1 text-xs dark:border-rose-700"
        >
          취소
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm">
        <label className="font-medium text-rose-900 dark:text-rose-200">매도일:</label>
        <input
          type="date"
          value={sellDate}
          onChange={(e) => setSellDate(e.target.value)}
          className="rounded border border-rose-300 bg-white px-2 py-1 text-xs dark:border-rose-700 dark:bg-zinc-900"
        />
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rose-200 text-left text-xs text-rose-700 dark:border-rose-800/50 dark:text-rose-400">
              <th className="py-2">종목</th>
              <th className="py-2 text-right">수량</th>
              <th className="py-2 text-right">매수가</th>
              <th className="py-2 text-right">매도가</th>
              <th className="py-2 text-right">매도금액</th>
              <th className="py-2 text-right">손익</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => {
              const sp = Number(prices[t.position.id]);
              const proceeds = Number.isFinite(sp) ? sp * t.position.quantity : 0;
              const pnl = proceeds - t.position.buyPrice * t.position.quantity;
              return (
                <tr
                  key={t.position.id}
                  className="border-b border-rose-100 dark:border-rose-900/30"
                >
                  <td className="py-2 text-xs">
                    <span className="font-medium">{t.position.name}</span>
                    <span className="ml-1.5 text-zinc-400">{t.position.ticker}</span>
                    <p className="text-[10px] text-rose-700 dark:text-rose-400">{t.reason}</p>
                  </td>
                  <td className="py-2 text-right tabular-nums text-xs">
                    {t.position.quantity.toLocaleString()}
                  </td>
                  <td className="py-2 text-right tabular-nums text-xs text-zinc-600 dark:text-zinc-400">
                    {Math.round(t.position.buyPrice).toLocaleString()}원
                  </td>
                  <td className="py-2 text-right">
                    <input
                      type="number"
                      value={prices[t.position.id]}
                      onChange={(e) =>
                        setPrices({ ...prices, [t.position.id]: e.target.value })
                      }
                      className="w-24 rounded border border-rose-300 bg-white px-1 py-0.5 text-right text-xs tabular-nums dark:border-rose-700 dark:bg-zinc-900"
                    />
                  </td>
                  <td className="py-2 text-right tabular-nums text-xs">
                    {proceeds.toLocaleString()}원
                  </td>
                  <td
                    className={
                      "py-2 text-right text-xs font-medium tabular-nums " +
                      (pnl > 0
                        ? "text-emerald-700 dark:text-emerald-400"
                        : pnl < 0
                          ? "text-rose-700 dark:text-rose-400"
                          : "")
                    }
                  >
                    {pnl > 0 ? "+" : ""}
                    {Math.round(pnl).toLocaleString()}원
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-rose-300 font-bold dark:border-rose-700">
              <td className="py-2 text-sm" colSpan={4}>
                합계
              </td>
              <td className="py-2 text-right tabular-nums text-sm">
                {Math.round(totalProceeds).toLocaleString()}원
              </td>
              <td
                className={
                  "py-2 text-right tabular-nums text-sm " +
                  (totalPnl > 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-rose-700 dark:text-rose-400")
                }
              >
                {totalPnl > 0 ? "+" : ""}
                {Math.round(totalPnl).toLocaleString()}원
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {error && <p className="mt-3 text-xs text-rose-700">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => {
            if (
              !confirm(
                `${targets.length}종목 일괄 매도하시겠습니까?\n매도금액 합계 ${Math.round(totalProceeds).toLocaleString()}원이 현금으로 적립됩니다.`,
              )
            )
              return;
            submit();
          }}
          disabled={busy}
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {busy ? "처리 중..." : `${targets.length}종목 일괄 매도`}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={busy}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
        >
          취소
        </button>
      </div>
    </div>
  );
}
