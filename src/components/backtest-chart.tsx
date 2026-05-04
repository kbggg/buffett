"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = {
  date: string;
  ours: number; // 누적 수익률 fraction
  kospi: number;
};

export function BacktestChart({ data }: { data: Point[] }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="mb-3 text-sm font-semibold">누적 수익률 — 시스템 vs KOSPI</h3>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(113, 113, 122, 0.2)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#71717a" }} />
          <YAxis
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
            width={60}
          />
          <Tooltip
            formatter={(v) =>
              `${(typeof v === "number" ? v * 100 : Number(v) * 100).toFixed(2)}%`
            }
            contentStyle={{
              background: "rgba(24, 24, 27, 0.95)",
              border: "1px solid rgba(113, 113, 122, 0.3)",
              borderRadius: 8,
              color: "#fff",
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="ours"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            name="시스템"
          />
          <Line
            type="monotone"
            dataKey="kospi"
            stroke="#a1a1aa"
            strokeWidth={2}
            dot={false}
            name="KOSPI"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
