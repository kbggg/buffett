import type { Recommendation } from "@/lib/recommendation";

const COLOR_STYLES: Record<Recommendation["color"], string> = {
  green: "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-200",
  blue: "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-200",
  amber: "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200",
  neutral: "bg-zinc-50 border-zinc-200 text-zinc-900 dark:bg-zinc-900/30 dark:border-zinc-700 dark:text-zinc-200",
  orange: "bg-orange-50 border-orange-200 text-orange-900 dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-200",
  rose: "bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-200",
  zinc: "bg-zinc-50 border-zinc-200 text-zinc-700 dark:bg-zinc-900/30 dark:border-zinc-700 dark:text-zinc-400",
};

const ICON: Record<Recommendation["color"], string> = {
  green: "🟢",
  blue: "🔵",
  amber: "🟡",
  neutral: "⚪",
  orange: "🟠",
  rose: "🔴",
  zinc: "⚫",
};

function fmtPrice(v: number | null): string {
  if (v === null) return "-";
  return `${Math.round(v).toLocaleString()}원`;
}

export function RecommendationBox({
  rec,
  currentPrice,
}: {
  rec: Recommendation;
  currentPrice: number | null;
}) {
  const showBuyGuide =
    (rec.action === "BUY_NOW" || rec.action === "BUY_GRADUAL" || rec.action === "WATCH") &&
    rec.buyTargetPrice !== null;
  const showSellGuide =
    (rec.action === "HOLD" || rec.action === "SELL_REVIEW" || rec.action === "SELL_URGENT") &&
    rec.sellTargetPrice !== null;

  return (
    <section className={`rounded-xl border p-5 ${COLOR_STYLES[rec.color]}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">{ICON[rec.color]}</span>
        <div className="flex-1">
          <h2 className="text-lg font-bold">권장 액션: {rec.label}</h2>
          <p className="mt-1 text-sm">{rec.reason}</p>
        </div>
      </div>

      {showBuyGuide && (
        <div className="mt-4 border-t border-current/10 pt-4">
          <h3 className="text-sm font-semibold">매수 가격 가이드</h3>
          <p className="mt-1 text-xs opacity-75">
            현재가 {fmtPrice(currentPrice)} · 적정가 {fmtPrice((rec.buyTargetPrice ?? 0) / 0.7)}
          </p>
          <div className="mt-3 space-y-1.5 text-xs">
            <PriceRow label="🎯 매수 적정가 (안전마진 30%)" price={rec.buyTargetPrice} highlight />
            {rec.action === "BUY_GRADUAL" &&
              rec.buyStages.map((s) => (
                <PriceRow
                  key={s.stage}
                  label={`  ${s.stage}차 분할 (안전마진 ${s.mos})`}
                  price={s.price}
                />
              ))}
          </div>
        </div>
      )}

      {showSellGuide && (
        <div className="mt-4 border-t border-current/10 pt-4">
          <h3 className="text-sm font-semibold">매도 가격 가이드</h3>
          <p className="mt-1 text-xs opacity-75">
            현재가 {fmtPrice(currentPrice)} · 적정가 {fmtPrice(rec.sellTargetPrice)}
          </p>
          <div className="mt-3 space-y-1.5 text-xs">
            <PriceRow label="📊 적정가 도달 (검토)" price={rec.sellTargetPrice} />
            <PriceRow label="⚠️ 과열 (매도 권장)" price={rec.sellUrgentPrice} highlight />
          </div>
        </div>
      )}

      <p className="mt-4 border-t border-current/10 pt-3 text-[10px] opacity-60">
        ⚠️ 시스템 권장은 객관적 지표 기반 참고용. 실제 매수/매도는 본인 판단 + 추가 분석 필요.
        한 번에 큰 자본 투입 X — 점진적 증액 권장.
      </p>
    </section>
  );
}

function PriceRow({
  label,
  price,
  highlight,
}: {
  label: string;
  price: number | null;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between ${highlight ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{fmtPrice(price)}</span>
    </div>
  );
}

/**
 * 카드용 작은 배지.
 */
export function RecommendationBadge({ rec }: { rec: Recommendation }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${COLOR_STYLES[rec.color]} border`}
    >
      <span>{ICON[rec.color]}</span>
      <span>{rec.label}</span>
    </span>
  );
}
