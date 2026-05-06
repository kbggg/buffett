import { formatNextRebalance } from "@/lib/rebalance";

type Props = {
  buyCount: number;       // 현재 매수후보 (Score≥80 + MoS≥30%) 종목 수
  holdingCount: number;   // 보유 종목 수
  rankDropCount: number;  // 보유 중 매수후보에서 빠진 종목 수
};

/**
 * 분기 리밸런스 안내.
 * - 평소: 작은 배지 ("다음 점검: 2026-06-30 D-54")
 * - 분기말 ±7일: 큰 배너 (강조 색상 + 행동 가이드)
 *
 * 백테스트가 분기마다 강제 리밸런스 → 사용자도 같은 시점에 동일 행동 권장.
 */
export function RebalanceBanner({ buyCount, holdingCount, rankDropCount }: Props) {
  const { date, daysLeft, inWindow } = formatNextRebalance();

  if (!inWindow) {
    return (
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
        <span>📅</span>
        <span>
          다음 분기 점검: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{date}</span>
          <span className="ml-1 text-zinc-400">(D-{daysLeft})</span>
        </span>
      </div>
    );
  }

  const isToday = daysLeft === 0;

  return (
    <section className="mb-6 rounded-xl border-2 border-violet-300 bg-violet-50 p-4 sm:p-5 dark:border-violet-700 dark:bg-violet-950/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-violet-900 sm:text-base dark:text-violet-200">
            🔄 분기 리밸런스 시기 — {isToday ? "오늘이 점검일" : `D-${daysLeft} (${date})`}
          </h2>
          <p className="mt-1 text-xs text-violet-800 dark:text-violet-300">
            백테스트와 동일하게 분기마다 한 번 점검하면 같은 결과를 따라갑니다.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-sm sm:gap-3">
        <Stat label="매수후보" value={buyCount} sub="가치+안전마진" />
        <Stat label="보유" value={holdingCount} sub="포트폴리오" />
        <Stat
          label="랭킹 이탈"
          value={rankDropCount}
          sub="매수후보에서 빠짐"
          tone={rankDropCount > 0 ? "warn" : "ok"}
        />
      </div>

      <ul className="mt-4 list-disc space-y-1 pl-5 text-[11px] text-violet-800 sm:text-xs dark:text-violet-300">
        <li>이탈 종목은 매도 검토 (백테스트 규칙)</li>
        <li>매수후보 상위 10종목 균등 분배</li>
        <li>거래비용 약 0.4% 가정</li>
      </ul>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: number;
  sub: string;
  tone?: "ok" | "warn" | "neutral";
}) {
  const valueColor =
    tone === "warn" && value > 0
      ? "text-rose-700 dark:text-rose-300"
      : tone === "ok" && value === 0
        ? "text-emerald-700 dark:text-emerald-300"
        : "text-violet-900 dark:text-violet-100";
  return (
    <div className="rounded-lg bg-white p-2.5 sm:p-3 dark:bg-zinc-900/60">
      <p className="text-[10px] text-zinc-500 sm:text-xs dark:text-zinc-400">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums sm:text-2xl ${valueColor}`}>{value}</p>
      <p className="mt-0.5 text-[10px] text-zinc-500 sm:text-xs dark:text-zinc-400">{sub}</p>
    </div>
  );
}
