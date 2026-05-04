"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const TRILLION = 1_000_000_000_000;
const BILLION = 100_000_000;

type Point = {
  fiscalYear: number;
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
};

function fmt(v: number) {
  if (Math.abs(v) >= TRILLION) return `${(v / TRILLION).toFixed(1)}조`;
  return `${(v / BILLION).toFixed(0)}억`;
}

export function FinancialsChart({ annuals }: { annuals: Point[] }) {
  // 오래된 → 최신 순으로 정렬, NULL 제거
  const data = annuals
    .slice()
    .reverse()
    .filter((a) => a.revenue || a.operatingIncome || a.netIncome)
    .map((a) => ({
      year: `${a.fiscalYear}`,
      매출: a.revenue ? Number(a.revenue) : 0,
      영업이익: a.operatingIncome ? Number(a.operatingIncome) : 0,
      순이익: a.netIncome ? Number(a.netIncome) : 0,
    }));

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        재무 데이터 없음
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="mb-3 text-sm font-semibold">연도별 재무 추이</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(113, 113, 122, 0.2)" />
          <XAxis dataKey="year" tick={{ fontSize: 12, fill: "#71717a" }} />
          <YAxis
            tick={{ fontSize: 12, fill: "#71717a" }}
            tickFormatter={(v: number) => fmt(v)}
            width={60}
          />
          <Tooltip
            formatter={(v) => fmt(typeof v === "number" ? v : Number(v) || 0)}
            contentStyle={{
              background: "rgba(24, 24, 27, 0.95)",
              border: "1px solid rgba(113, 113, 122, 0.3)",
              borderRadius: 8,
              color: "#fff",
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="매출" fill="#10b981" radius={[4, 4, 0, 0]} />
          <Bar dataKey="영업이익" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          <Bar dataKey="순이익" fill="#a855f7" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
