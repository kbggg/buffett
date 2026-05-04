import { getCandidates, getCounts, getLatestCalcDate } from "@/lib/queries";
import { CandidateCard } from "@/components/candidate-card";

const TRILLION = 1_000_000_000_000;

function formatMarketCap(mc: number | null): string {
  if (mc === null) return "-";
  return `${(mc / TRILLION).toFixed(2)}조`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type FilterParam = "buy" | "value" | "all";

const FILTERS: { key: FilterParam; label: string; description: string }[] = [
  { key: "buy", label: "매수후보", description: "가치 + 안전마진 + 타이밍 모두 통과" },
  { key: "value", label: "가치통과", description: "Buffett Score ≥ 80 + 안전마진 ≥ 30%" },
  { key: "all", label: "전체", description: "산출된 모든 종목" },
];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ filter?: FilterParam }>;
}) {
  const { filter = "buy" } = await searchParams;
  const calcDate = await getLatestCalcDate();
  const counts = calcDate ? await getCounts(calcDate) : { all: 0, valuePass: 0, buy: 0 };

  const candidates = calcDate
    ? await getCandidates(
        filter === "buy"
          ? { calcDate, minScore: 80, minMos: 0.3, timingOnly: ["BUY"], limit: 50 }
          : filter === "value"
            ? { calcDate, minScore: 80, minMos: 0.3, limit: 100 }
            : { calcDate, limit: 100 },
      )
    : [];

  return (
    <div className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">오늘 살 만한 종목</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {formatDate(calcDate)} 기준 · KOSPI · 워렌 버핏 가치투자 원칙
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <a
              href="/portfolio"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Portfolio →
            </a>
            <a
              href="/whatif"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              What If →
            </a>
          </div>
        </header>

        <nav className="mb-6 flex flex-wrap gap-2" aria-label="필터">
          {FILTERS.map((f) => {
            const isActive = filter === f.key;
            const count =
              f.key === "buy" ? counts.buy : f.key === "value" ? counts.valuePass : counts.all;
            return (
              <a
                key={f.key}
                href={`?filter=${f.key}`}
                className={
                  "group inline-flex items-baseline gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors " +
                  (isActive
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800")
                }
              >
                <span>{f.label}</span>
                <span
                  className={
                    "text-xs " +
                    (isActive
                      ? "text-white/70 dark:text-zinc-900/70"
                      : "text-zinc-400 dark:text-zinc-500")
                  }
                >
                  {count}
                </span>
              </a>
            );
          })}
          <p className="ml-2 self-center text-xs text-zinc-500 dark:text-zinc-400">
            {FILTERS.find((f) => f.key === filter)?.description}
          </p>
        </nav>

        {candidates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">조건에 맞는 종목이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {candidates.map((c) => (
              <CandidateCard
                key={c.ticker}
                candidate={c}
                marketCapLabel={formatMarketCap(c.marketCap)}
              />
            ))}
          </div>
        )}

        <footer className="mt-12 border-t border-zinc-200 pt-6 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <p>
            ⚠️ 이 시스템의 결과는 참고용입니다. 단년 데이터 기반의 점수는 노이즈가 큽니다 — 5년치
            데이터 보강 후 더 정확한 평가가 나옵니다. 실제 매수 결정은 추가 분석 + 본인 판단이 필요합니다.
          </p>
        </footer>
      </div>
    </div>
  );
}
