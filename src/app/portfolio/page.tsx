import Link from "next/link";
import { getPortfolio, type PortfolioPosition } from "@/lib/queries";
import { AddPositionForm, SellButton } from "@/components/portfolio-actions";

const MILLION = 1_000_000;
const BILLION = 100_000_000;

function fmtMoney(v: number | null): string {
  if (v === null) return "-";
  if (Math.abs(v) >= BILLION) return `${(v / BILLION).toFixed(2)}억`;
  if (Math.abs(v) >= MILLION) return `${(v / MILLION).toFixed(1)}M`;
  return v.toLocaleString();
}

function fmtPct(v: number | null): string {
  if (v === null) return "-";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
}

export default async function PortfolioPage() {
  const positions = await getPortfolio();
  const open = positions.filter((p) => !p.isClosed);
  const closed = positions.filter((p) => p.isClosed);

  // 합계
  const totalBuy = open.reduce((s, p) => s + p.buyValue, 0);
  const totalCurrent = open.reduce((s, p) => s + (p.currentValue ?? 0), 0);
  const totalPnl = totalCurrent - totalBuy;
  const totalPnlPct = totalBuy > 0 ? totalPnl / totalBuy : 0;
  const realized = closed.reduce((s, p) => s + (p.pnl ?? 0), 0);

  return (
    <div className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← Today
        </Link>

        <header className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">포트폴리오</h1>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                보유 {open.length}종목 · 청산 {closed.length}종목 · 수동 입력 (KIS 자동 동기화는 Phase 5)
              </p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="매수 원금" value={fmtMoney(totalBuy)} />
            <Stat label="현재 평가" value={fmtMoney(totalCurrent)} />
            <Stat
              label="평가손익"
              value={`${fmtMoney(totalPnl)} (${fmtPct(totalPnlPct)})`}
              positive={totalPnl > 0}
              negative={totalPnl < 0}
            />
            <Stat
              label="실현손익 (청산)"
              value={fmtMoney(realized)}
              positive={realized > 0}
              negative={realized < 0}
            />
          </div>
        </header>

        <AddPositionForm />

        {/* 보유 중 */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-base font-bold">보유 중 ({open.length})</h2>
          {open.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">보유 종목이 없습니다.</p>
          ) : (
            <PositionTable positions={open} showActions />
          )}
        </section>

        {/* 청산 */}
        {closed.length > 0 && (
          <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-4 text-base font-bold">청산 ({closed.length})</h2>
            <PositionTable positions={closed} />
          </section>
        )}

        <footer className="text-xs text-zinc-500 dark:text-zinc-400">
          ⚠️ 현재 평가는 직전 거래일 종가 기준. KIS 모의투자/실전 잔고 동기화는 Phase 5에서 추가.
        </footer>
      </div>
    </div>
  );
}

function PositionTable({
  positions,
  showActions,
}: {
  positions: PortfolioPosition[];
  showActions?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
            <th className="py-2">종목</th>
            <th className="py-2">매수일</th>
            <th className="py-2 text-right">수량</th>
            <th className="py-2 text-right">매수가</th>
            <th className="py-2 text-right">현재가</th>
            <th className="py-2 text-right">평가</th>
            <th className="py-2 text-right">손익</th>
            {showActions && <th className="py-2"></th>}
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2 text-xs">
                <Link href={`/stock/${p.ticker}`} className="hover:underline">
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-1.5 text-zinc-400">{p.ticker}</span>
                </Link>
                {p.notes && <p className="text-xs text-zinc-400">{p.notes}</p>}
              </td>
              <td className="py-2 text-xs tabular-nums">{p.buyDate}</td>
              <td className="py-2 text-right tabular-nums text-xs">{p.quantity.toLocaleString()}</td>
              <td className="py-2 text-right tabular-nums text-xs">
                {Math.round(p.buyPrice).toLocaleString()}
              </td>
              <td className="py-2 text-right tabular-nums text-xs">
                {p.currentPrice !== null ? Math.round(p.currentPrice).toLocaleString() : "-"}
                {p.isClosed && <span className="ml-1 text-zinc-400">({p.sellDate})</span>}
              </td>
              <td className="py-2 text-right tabular-nums text-xs">
                {fmtMoney(p.currentValue)}
              </td>
              <td
                className={
                  "py-2 text-right tabular-nums text-xs font-medium " +
                  (p.pnl !== null && p.pnl > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : p.pnl !== null && p.pnl < 0
                      ? "text-rose-600 dark:text-rose-400"
                      : "")
                }
              >
                {fmtMoney(p.pnl)}
                <span className="ml-1 text-zinc-400">({fmtPct(p.pnlPct)})</span>
              </td>
              {showActions && (
                <td className="py-2">
                  <SellButton id={p.id} ticker={p.ticker} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
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
      <p className={`mt-1 text-lg font-bold tabular-nums ${colorClass}`}>{value}</p>
    </div>
  );
}
