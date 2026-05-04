"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";

const RANGES = [
  { key: "3M", days: 90, label: "3개월" },
  { key: "6M", days: 180, label: "6개월" },
  { key: "1Y", days: 365, label: "1년" },
  { key: "3Y", days: 365 * 3, label: "3년" },
  { key: "5Y", days: 365 * 5, label: "5년" },
] as const;

type Point = { date: string; close: number };

export function PriceChart({
  ticker,
  initialData,
}: {
  ticker: string;
  initialData: Point[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("1Y");
  const [data, setData] = useState<Point[]>(initialData);
  const [loading, setLoading] = useState(false);

  // 차트 생성 (한 번만)
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 320,
      layout: {
        background: { color: "transparent" },
        textColor: "#71717a",
      },
      grid: {
        vertLines: { color: "rgba(113, 113, 122, 0.1)" },
        horzLines: { color: "rgba(113, 113, 122, 0.1)" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: false },
      crosshair: { mode: 1 },
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: "#10b981",
      topColor: "rgba(16, 185, 129, 0.3)",
      bottomColor: "rgba(16, 185, 129, 0.0)",
      priceFormat: { type: "price", precision: 0, minMove: 1 },
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const onResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // 데이터 업데이트
  useEffect(() => {
    if (!seriesRef.current) return;
    const series = seriesRef.current;
    const points = data.map((p) => ({
      time: (Date.parse(p.date) / 1000) as UTCTimestamp as Time,
      value: p.close,
    }));
    series.setData(points);
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  // 범위 변경 시 fetch
  async function selectRange(key: (typeof RANGES)[number]["key"]) {
    if (key === range) return;
    setRange(key);
    const days = RANGES.find((r) => r.key === key)!.days;
    setLoading(true);
    try {
      const res = await fetch(`/api/prices?ticker=${ticker}&days=${days}`);
      const json = (await res.json()) as Point[];
      setData(json);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">가격 추이</h3>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => selectRange(r.key)}
              className={
                "rounded px-2 py-1 text-xs font-medium transition-colors " +
                (range === r.key
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800")
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="h-80 w-full" />
      {loading && (
        <p className="mt-2 text-center text-xs text-zinc-500">불러오는 중…</p>
      )}
    </div>
  );
}
