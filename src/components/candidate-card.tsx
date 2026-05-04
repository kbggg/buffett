import Link from "next/link";
import type { Candidate, EventItem } from "@/lib/queries";

const EVENT_BADGE: Record<EventItem["category"], string> = {
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-rose-600 dark:text-rose-400",
  info: "text-blue-600 dark:text-blue-400",
  neutral: "text-zinc-500 dark:text-zinc-400",
};

const EVENT_PREFIX: Record<EventItem["category"], string> = {
  positive: "+",
  negative: "−",
  info: "·",
  neutral: "·",
};

function pickHighlightEvents(events: EventItem[]): EventItem[] {
  // 우선 negative+positive 위주, 그 다음 info, 그 다음 neutral. 최대 3개.
  const ranked = [...events].sort((a, b) => {
    const order: Record<EventItem["category"], number> = {
      negative: 0,
      positive: 1,
      info: 2,
      neutral: 3,
    };
    return order[a.category] - order[b.category];
  });
  return ranked.slice(0, 3);
}

function formatEventDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

type CompositeSignal = "BUY" | "VALUE_ONLY" | "TIMING_ONLY" | "PLAIN";

const COMPOSITE_STYLES: Record<CompositeSignal, string> = {
  BUY: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  VALUE_ONLY: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  TIMING_ONLY: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  PLAIN: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

const COMPOSITE_LABELS: Record<CompositeSignal, string> = {
  BUY: "매수후보",
  VALUE_ONLY: "가치 OK · 타이밍 대기",
  TIMING_ONLY: "기술적 OK · 가치 미검증",
  PLAIN: "평이",
};

function compositeSignal(c: Candidate): CompositeSignal {
  const valueOk =
    c.buffettScore >= 80 &&
    c.marginOfSafety !== null &&
    c.marginOfSafety >= 0.3;
  const timingOk = c.timingSignal === "BUY";
  if (valueOk && timingOk) return "BUY";
  if (valueOk) return "VALUE_ONLY";
  if (timingOk) return "TIMING_ONLY";
  return "PLAIN";
}

function scoreColor(score: number): string {
  if (score >= 90) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 70) return "text-emerald-700/80 dark:text-emerald-300/80";
  if (score >= 50) return "text-amber-700 dark:text-amber-400";
  return "text-zinc-500 dark:text-zinc-500";
}

function mosColor(mos: number): string {
  if (mos >= 0.3) return "text-emerald-600 dark:text-emerald-400";
  if (mos >= 0.15) return "text-amber-700 dark:text-amber-400";
  if (mos >= 0) return "text-zinc-500 dark:text-zinc-500";
  return "text-rose-600 dark:text-rose-400";
}

function buildSummary(c: Candidate): string {
  const bd = c.breakdown;
  if (!bd?.components) return "";
  const parts: string[] = [];
  const prof = bd.components.profitability;
  if (prof && prof.score / prof.max >= 0.7) parts.push("수익성 ↑");
  const health = bd.components.health;
  if (health && health.score / health.max >= 0.7) parts.push("재무 건전");
  const cash = bd.components.cash_gen;
  if (cash && cash.score / cash.max >= 0.7) parts.push("현금흐름 ↑");
  const growth = bd.components.growth;
  if (growth && growth.score / growth.max >= 0.7) parts.push("성장 ↑");
  if (parts.length === 0) parts.push("주요 강점 약함");
  return parts.slice(0, 3).join(" · ");
}

export function CandidateCard({
  candidate,
  marketCapLabel,
}: {
  candidate: Candidate;
  marketCapLabel: string;
}) {
  const c = candidate;
  const composite = compositeSignal(c);
  const mosPct = c.marginOfSafety !== null ? Math.round(c.marginOfSafety * 100) : null;
  const summary = buildSummary(c);
  const timing = c.breakdown?.timing;

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/stock/${c.ticker}`}
            className="block truncate text-base font-semibold hover:underline"
          >
            {c.name}
          </Link>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {c.ticker} · {c.market} · {marketCapLabel}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${COMPOSITE_STYLES[composite]}`}
        >
          {COMPOSITE_LABELS[composite]}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Buffett Score</p>
          <p className={`mt-0.5 text-2xl font-bold tabular-nums ${scoreColor(c.buffettScore)}`}>
            {c.buffettScore.toFixed(0)}
            <span className="text-sm font-normal text-zinc-400">/100</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">안전마진</p>
          <p
            className={`mt-0.5 text-2xl font-bold tabular-nums ${
              mosPct !== null ? mosColor(c.marginOfSafety!) : "text-zinc-400"
            }`}
          >
            {mosPct !== null ? `${mosPct > 0 ? "+" : ""}${mosPct}%` : "-"}
          </p>
        </div>
      </div>

      <p className="text-sm text-zinc-700 dark:text-zinc-300">{summary}</p>

      <div className="grid grid-cols-2 gap-3 rounded-md bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-800/50">
        <div>
          <span className="text-zinc-500 dark:text-zinc-400">PBR</span>
          <span className="ml-2 font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
            {c.pbr !== null ? c.pbr.toFixed(2) : "-"}
          </span>
        </div>
        <div>
          <span className="text-zinc-500 dark:text-zinc-400">PER</span>
          <span className="ml-2 font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
            {c.per !== null ? c.per.toFixed(1) : "-"}
          </span>
        </div>
      </div>

      {c.recentEvents.length > 0 && (
        <div className="space-y-1 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            최근 90일 이슈 ({c.recentEvents.length}건)
          </p>
          {pickHighlightEvents(c.recentEvents).map((ev, i) => (
            <p key={i} className="text-xs text-zinc-600 dark:text-zinc-300">
              <span className="text-zinc-400">{formatEventDate(ev.date)}</span>
              <span className={`mx-1.5 font-bold ${EVENT_BADGE[ev.category]}`}>
                {EVENT_PREFIX[ev.category]}
              </span>
              <span className="line-clamp-1">{ev.title}</span>
            </p>
          ))}
        </div>
      )}

      {timing && (
        <div className="border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <span>52주 위치 {timing.pos_52w !== null && timing.pos_52w !== undefined ? `${Math.round(timing.pos_52w * 100)}%` : "-"}</span>
          <span className="mx-2">·</span>
          <span>RSI {timing.rsi_14 !== null && timing.rsi_14 !== undefined ? Math.round(timing.rsi_14) : "-"}</span>
          <span className="mx-2">·</span>
          <span>{timing.above_ma200 ? "200일선 ↑" : "200일선 ↓"}</span>
        </div>
      )}
      {c.fundamentalsAsOf && (
        <p className="mt-auto text-[10px] text-zinc-400 dark:text-zinc-500">
          ⓘ 재무 기준: FY{c.fiscalYear} 사업보고서 ({c.fundamentalsAsOf} 공시) · 가격은 직전 거래일
        </p>
      )}
    </article>
  );
}
