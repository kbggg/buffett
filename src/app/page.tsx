import { getCandidates, getCounts, getLatestCalcDate } from "@/lib/queries";
import { CandidateCard } from "@/components/candidate-card";

// 점수는 일별 cron으로만 갱신 — 1시간 캐시로 충분
export const revalidate = 3600;

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
type SortParam = "score" | "mos" | "marketcap";
type CycleFilter = "all" | "cyclical" | "defensive" | "growth" | "financial";

const FILTERS: { key: FilterParam; label: string; description: string }[] = [
  { key: "buy", label: "매수후보", description: "가치 + 안전마진 + 타이밍 모두 통과" },
  { key: "value", label: "가치통과", description: "Buffett Score ≥ 80 + 안전마진 ≥ 30%" },
  { key: "all", label: "전체", description: "산출된 모든 종목" },
];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ filter?: FilterParam; q?: string; sort?: SortParam; cycle?: CycleFilter }>;
}) {
  const { filter = "buy", q = "", sort = "score", cycle = "all" } = await searchParams;
  const calcDate = await getLatestCalcDate();
  const counts = calcDate ? await getCounts(calcDate) : { all: 0, valuePass: 0, buy: 0 };

  let candidates = calcDate
    ? await getCandidates(
        filter === "buy"
          ? { calcDate, minScore: 80, minMos: 0.3, timingOnly: ["BUY"], limit: 200 }
          : filter === "value"
            ? { calcDate, minScore: 80, minMos: 0.3, limit: 200 }
            : { calcDate, limit: 500 },
      )
    : [];

  // 검색 필터
  if (q) {
    const ql = q.toLowerCase();
    candidates = candidates.filter(
      (c) => c.name.toLowerCase().includes(ql) || c.ticker.includes(q),
    );
  }
  // cycle_type 필터 (cycle은 candidate 안에 없으니 stocks 별도 lookup 필요 — MVP: 컬럼 추가)
  // 정렬
  if (sort === "mos") {
    candidates = candidates.sort((a, b) => (b.marginOfSafety ?? -99) - (a.marginOfSafety ?? -99));
  } else if (sort === "marketcap") {
    candidates = candidates.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
  } else {
    candidates = candidates.sort((a, b) => b.buffettScore - a.buffettScore);
  }
  candidates = candidates.slice(0, 100);

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
              href="/decisions"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              결정 로그 →
            </a>
            <a
              href="/whatif"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              What If →
            </a>
          </div>
        </header>

        <form className="mb-4 flex flex-wrap items-center gap-2" action="/" method="get">
          <input type="hidden" name="filter" value={filter} />
          <input
            name="q"
            defaultValue={q}
            placeholder="종목명 또는 티커 검색…"
            className="flex-1 min-w-[200px] rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <select
            name="sort"
            defaultValue={sort}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="score">점수 순</option>
            <option value="mos">안전마진 순</option>
            <option value="marketcap">시총 순</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            적용
          </button>
        </form>

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
