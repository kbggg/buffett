import Link from "next/link";
import { notFound } from "next/navigation";
import { getPriceSeries, getStockDetail } from "@/lib/queries";
import { Term } from "@/components/term";
import { PriceChart } from "@/components/price-chart";
import { FinancialsChart } from "@/components/financials-chart";

const TRILLION = 1_000_000_000_000;
const BILLION = 100_000_000;

function fmtMoney(v: number | null): string {
  if (v === null) return "-";
  if (Math.abs(v) >= TRILLION) return `${(v / TRILLION).toFixed(2)}조`;
  if (Math.abs(v) >= BILLION) return `${(v / BILLION).toFixed(0)}억`;
  return v.toLocaleString();
}

function fmtPrice(v: number | null): string {
  if (v === null) return "-";
  return `${Math.round(v).toLocaleString()}원`;
}

const SIGNAL_LABEL: Record<string, string> = {
  BUY: "매수 시점",
  WATCH: "관찰",
  NEUTRAL: "대기",
};

const CATEGORY_COLOR: Record<string, string> = {
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-rose-600 dark:text-rose-400",
  info: "text-blue-600 dark:text-blue-400",
  neutral: "text-zinc-500 dark:text-zinc-400",
};
const CATEGORY_PREFIX: Record<string, string> = {
  positive: "+",
  negative: "−",
  info: "·",
  neutral: "·",
};

export default async function Page({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const detail = await getStockDetail(ticker);
  if (!detail) notFound();

  const initialPrices = await getPriceSeries(ticker, 365);

  const components = detail.breakdown?.components ?? {};
  const compEntries: { key: string; label: string; data?: { score: number; max: number; details: Record<string, unknown> } }[] = [
    { key: "profitability", label: "수익성", data: components.profitability },
    { key: "health", label: "재무 건전성", data: components.health },
    { key: "cash_gen", label: "현금 창출", data: components.cash_gen },
    { key: "growth", label: "성장", data: components.growth },
    { key: "stability", label: "안정성", data: components.stability },
    { key: "oe_yield", label: "Owner Earnings yield", data: components.oe_yield },
  ];

  const mosPct = detail.marginOfSafety !== null
    ? Math.round(detail.marginOfSafety * 100)
    : null;
  const summary = buildSummary(detail);
  const timing = detail.breakdown?.timing;

  return (
    <div className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← Today
        </Link>

        {/* Header */}
        <header className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{detail.name}</h1>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {detail.ticker} · {detail.market} · 시총 {fmtMoney(detail.marketCap)} · 현재가 {fmtPrice(detail.latestPrice)}
              </p>
              {detail.annuals.length > 0 && (
                <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                  ⓘ 재무 기준: FY{detail.annuals[0].fiscalYear} 사업보고서 ({detail.annuals[0].reportDate} 공시) ·
                  Y{(detail.annuals[0].fiscalYear ?? 0) + 1} Q1은 5/15까지 자동 갱신
                </p>
              )}
            </div>
            {detail.timingSignal && (
              <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium dark:bg-zinc-800">
                {SIGNAL_LABEL[detail.timingSignal] ?? detail.timingSignal}
              </span>
            )}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric
              label="Buffett Score"
              value={
                detail.buffettScore !== null
                  ? `${detail.buffettScore.toFixed(0)}/100`
                  : "-"
              }
            />
            <Metric
              label={<><Term name="안전마진" /></>}
              value={mosPct !== null ? `${mosPct > 0 ? "+" : ""}${mosPct}%` : "-"}
              positive={mosPct !== null && mosPct > 0}
              negative={mosPct !== null && mosPct < 0}
            />
            <Metric
              label={<><Term name="PBR" /></>}
              value={detail.pbr !== null ? detail.pbr.toFixed(2) : "-"}
            />
            <Metric
              label={<><Term name="PER" /></>}
              value={detail.per !== null ? detail.per.toFixed(1) : "-"}
            />
          </div>
          {summary && (
            <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">{summary}</p>
          )}
        </header>

        {/* Price chart */}
        <PriceChart ticker={detail.ticker} initialData={initialPrices} />

        {/* Buffett Score 분해 */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-base font-bold">Buffett Score 분해</h2>
          <div className="space-y-3">
            {compEntries.map((c) => (
              <ComponentRow key={c.key} label={c.label} data={c.data} />
            ))}
          </div>
        </section>

        {/* 내재가치 */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-base font-bold">
            <Term name="내재가치" /> 계산 (3종 + 중앙값)
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <ValueCell label={<Term name="DCF" />} value={detail.intrinsicDcf} unit="원/주" />
            <ValueCell label={<Term name="OwnerEarnings" />} value={detail.intrinsicOwnerEarnings} unit="원/주" />
            <ValueCell label={<Term name="Graham" />} value={detail.intrinsicGraham} unit="원/주" />
            <ValueCell label="중앙값 (사용)" value={detail.intrinsicAvg} unit="원/주" highlight />
          </div>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            현재가 {fmtPrice(detail.latestPrice)} vs 적정가 {fmtPrice(detail.intrinsicAvg)} ={" "}
            <span className={mosPct !== null && mosPct > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
              {mosPct !== null ? `${mosPct > 0 ? "+" : ""}${mosPct}% 안전마진` : ""}
            </span>
          </p>
        </section>

        {/* 타이밍 신호 */}
        {timing && (
          <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-4 text-base font-bold">타이밍 신호</h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400"><Term name="52주위치" /></p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {timing.pos_52w !== null && timing.pos_52w !== undefined
                    ? `${Math.round(timing.pos_52w * 100)}%`
                    : "-"}
                </p>
                <p className={"text-xs " + (timing.pos_ok ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500")}>
                  {timing.pos_ok ? "✓ 안전 구간 (60-85%)" : "× 위험 구간"}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400"><Term name="RSI" /></p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {timing.rsi_14 !== null && timing.rsi_14 !== undefined
                    ? Math.round(timing.rsi_14)
                    : "-"}
                </p>
                <p className={"text-xs " + (timing.rsi_ok ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500")}>
                  {timing.rsi_ok ? "✓ 평이 (40-60)" : "× 과열/침체"}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400"><Term name="MA200" /></p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {timing.ma_200 ? `${Math.round(timing.ma_200).toLocaleString()}원` : "-"}
                </p>
                <p className={"text-xs " + (timing.above_ma200 ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500")}>
                  {timing.above_ma200 ? "✓ 상승 추세 (현재가 > MA200)" : "× 하락 추세"}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* 재무 추이 */}
        <FinancialsChart annuals={detail.annuals} />

        {/* 최근 이슈 */}
        {detail.events.length > 0 && (
          <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-4 text-base font-bold">최근 90일 이슈 ({detail.events.length}건)</h2>
            <ul className="space-y-1.5 text-sm">
              {detail.events.slice(0, 30).map((ev, i) => (
                <li key={i} className="text-zinc-600 dark:text-zinc-300">
                  <span className="text-zinc-400 tabular-nums mr-2">
                    {ev.date.slice(5)}
                  </span>
                  <span className={`mr-1.5 font-bold ${CATEGORY_COLOR[ev.category]}`}>
                    {CATEGORY_PREFIX[ev.category]}
                  </span>
                  <span>{ev.title}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function buildSummary(detail: { breakdown: { components?: Record<string, { score: number; max: number }> } | null; marginOfSafety: number | null }): string {
  const c = detail.breakdown?.components ?? {};
  const parts: string[] = [];
  if (c.profitability && c.profitability.score / c.profitability.max >= 0.8) parts.push("수익성 우수");
  if (c.health && c.health.score / c.health.max >= 0.8) parts.push("재무 건전");
  if (c.cash_gen && c.cash_gen.score / c.cash_gen.max >= 0.8) parts.push("현금흐름 안정");
  if (c.growth && c.growth.score / c.growth.max >= 0.8) parts.push("성장 양호");
  if (parts.length === 0) return "주요 지표 약함 — 신중히 평가하세요.";
  if (detail.marginOfSafety !== null) {
    if (detail.marginOfSafety >= 0.3) parts.push(`현재가 +${Math.round(detail.marginOfSafety * 100)}% 할인된 가격`);
    else if (detail.marginOfSafety < 0) parts.push(`현재가는 적정가보다 ${Math.round(-detail.marginOfSafety * 100)}% 비쌈`);
  }
  return parts.join(" · ");
}

function Metric({
  label,
  value,
  positive,
  negative,
}: {
  label: React.ReactNode;
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

function ComponentRow({
  label,
  data,
}: {
  label: string;
  data?: { score: number; max: number; details: Record<string, unknown> };
}) {
  if (!data) {
    return (
      <div className="flex items-center justify-between border-b border-zinc-100 py-2 text-sm dark:border-zinc-800">
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-400">-</span>
      </div>
    );
  }
  const ratio = data.score / data.max;
  const colorClass = ratio >= 0.7 ? "bg-emerald-500" : ratio >= 0.4 ? "bg-amber-500" : "bg-zinc-400";

  // 디테일 → 한글 설명
  const detailLines: string[] = [];
  const d = data.details;
  if (d.roe_avg !== undefined) detailLines.push(`ROE 평균 ${(Number(d.roe_avg) * 100).toFixed(1)}%`);
  if (d.op_margin_avg !== undefined) detailLines.push(`영업이익률 평균 ${(Number(d.op_margin_avg) * 100).toFixed(1)}%`);
  if (d.roe_volatility !== undefined) detailLines.push(`ROE 변동성 ${Number(d.roe_volatility).toFixed(2)}`);
  if (d.debt_ratio !== undefined) detailLines.push(`부채비율 ${(Number(d.debt_ratio) * 100).toFixed(0)}%`);
  if (d.current_ratio !== undefined) detailLines.push(`유동비율 ${Number(d.current_ratio).toFixed(2)}`);
  if (d.ocf_to_ni_avg !== undefined) detailLines.push(`OCF/순이익 ${Number(d.ocf_to_ni_avg).toFixed(2)}`);
  if (d.fcf_positive_years !== undefined) detailLines.push(`FCF 양수 ${d.fcf_positive_years}`);
  if (d.revenue_cagr !== undefined) detailLines.push(`매출 CAGR ${(Number(d.revenue_cagr) * 100).toFixed(1)}%`);
  if (d.net_income_cagr !== undefined) detailLines.push(`순이익 CAGR ${(Number(d.net_income_cagr) * 100).toFixed(1)}%`);
  if (d.losses !== undefined) detailLines.push(`최근 적자 ${d.losses}회 / ${d.years_observed}년`);
  if (d.oe_yield !== undefined) detailLines.push(`OE yield ${(Number(d.oe_yield) * 100).toFixed(1)}%`);

  return (
    <div className="border-b border-zinc-100 pb-2 dark:border-zinc-800">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-zinc-700 dark:text-zinc-300">
          {data.score.toFixed(0)} <span className="text-zinc-400">/ {data.max}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className={`h-full ${colorClass}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      {detailLines.length > 0 && (
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          {detailLines.join(" · ")}
        </p>
      )}
    </div>
  );
}

function ValueCell({
  label,
  value,
  unit,
  highlight,
}: {
  label: React.ReactNode;
  value: number | null;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? "rounded bg-emerald-50 p-2 dark:bg-emerald-950/30" : ""}>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">
        {value !== null ? Math.round(value).toLocaleString() : "-"}
        {value !== null && unit && (
          <span className="ml-1 text-xs font-normal text-zinc-500">{unit}</span>
        )}
      </p>
    </div>
  );
}
