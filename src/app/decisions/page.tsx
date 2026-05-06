import Link from "next/link";
import { getDecisions } from "@/lib/queries";
import { getNickname } from "@/lib/nickname";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  BUY: "매수",
  SELL: "매도",
  WATCH: "관찰",
  SKIP: "패스",
};

const COLOR: Record<string, string> = {
  BUY: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  SELL: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  WATCH: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  SKIP: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

function fmtPct(v: number | null): string {
  if (v === null) return "-";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

function fmtPrice(v: number | null): string {
  if (v === null) return "-";
  return `${Math.round(v).toLocaleString()}원`;
}

export default async function Page() {
  const nickname = await getNickname();
  const decisions = await getDecisions(nickname);

  // 종합 회고 통계
  const buys = decisions.filter((d) => d.decision === "BUY");
  const skips = decisions.filter((d) => d.decision === "SKIP");
  const buyHits = buys.filter((d) => d.priceChangePct !== null && d.priceChangePct > 0).length;
  const skipHits = skips.filter((d) => d.priceChangePct !== null && d.priceChangePct <= 0).length;

  return (
    <div className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← Today
        </Link>

        <header className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-bold sm:text-2xl">{nickname}의 결정 로그</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            본인이 시점별로 내린 결정 + 그 이후 결과 = 시간 지날수록 가치 ↑.
            CLAUDE.md "본인이 안 산 종목/산 종목을 1년 후 돌아보기 위한 학습 데이터".
          </p>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="총 결정 수" value={`${decisions.length}건`} />
            <Stat
              label="매수 적중률"
              value={buys.length ? `${Math.round((buyHits / buys.length) * 100)}% (${buyHits}/${buys.length})` : "-"}
            />
            <Stat
              label="패스 적중률"
              value={skips.length ? `${Math.round((skipHits / skips.length) * 100)}% (${skipHits}/${skips.length})` : "-"}
            />
            <Stat
              label="가장 최근 결정"
              value={decisions[0]?.decisionDate ?? "-"}
            />
          </div>
        </header>

        {decisions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              아직 기록한 결정이 없습니다.
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              Stock Detail 페이지에서 &quot;+ 결정 기록&quot; 버튼으로 추가하세요.
            </p>
          </div>
        ) : (
          <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                    <th className="px-4 py-3">날짜</th>
                    <th className="px-4 py-3">종목</th>
                    <th className="px-4 py-3 text-center">결정</th>
                    <th className="px-4 py-3 text-right">결정 시점 가격</th>
                    <th className="px-4 py-3 text-right">현재가</th>
                    <th className="px-4 py-3 text-right">변화율</th>
                    <th className="px-4 py-3">이유</th>
                  </tr>
                </thead>
                <tbody>
                  {decisions.map((d) => (
                    <tr key={d.id} className="border-b border-zinc-100 align-top dark:border-zinc-900">
                      <td className="px-4 py-3 text-xs tabular-nums">
                        {d.decisionDate}
                        <p className="text-zinc-400">{d.daysSince}일 전</p>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <Link href={`/stock/${d.ticker}`} className="hover:underline">
                          <span className="font-medium">{d.name}</span>
                          <span className="ml-1.5 text-zinc-400">{d.ticker}</span>
                        </Link>
                        {d.snapshotScore !== null && (
                          <p className="text-zinc-400">
                            Score {d.snapshotScore.toFixed(0)} / MoS{" "}
                            {d.snapshotMos !== null ? `${(d.snapshotMos * 100).toFixed(0)}%` : "-"}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${COLOR[d.decision]}`}>
                          {LABEL[d.decision]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums">
                        {fmtPrice(d.snapshotPrice)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums">
                        {fmtPrice(d.currentPrice)}
                      </td>
                      <td
                        className={
                          "px-4 py-3 text-right text-xs font-medium tabular-nums " +
                          (d.priceChangePct !== null && d.priceChangePct > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : d.priceChangePct !== null && d.priceChangePct < 0
                              ? "text-rose-600 dark:text-rose-400"
                              : "")
                        }
                      >
                        {fmtPct(d.priceChangePct)}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                        {d.reason ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <footer className="text-xs text-zinc-500 dark:text-zinc-400">
          <p>
            ⓘ <strong>매수 적중률</strong>: BUY 결정 중 그 이후 가격 +수익. <strong>패스 적중률</strong>: SKIP 결정 중
            그 이후 가격 동일/하락 (안 산 게 다행). 시간이 지날수록 통계 의미 ↑.
          </p>
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
