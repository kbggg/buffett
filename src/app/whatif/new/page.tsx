"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const TODAY = new Date().toISOString().slice(0, 10);
const ONE_YEAR_AGO = new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10);

type FormState = {
  start: string;
  end: string;
  capital: number;
  freq: "monthly" | "quarterly";
  positions: number;
  minScore: number;
  minMos: number;
  txCost: number;
};

const DEFAULTS: FormState = {
  start: ONE_YEAR_AGO,
  end: TODAY,
  capital: 100_000_000,
  freq: "monthly",
  positions: 10,
  minScore: 80,
  minMos: 0.3,
  txCost: 0.004,
};

export default function NewBacktestPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "실패");
      router.push(`/whatif?id=${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/whatif"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← What If
        </Link>

        <header className="mt-4 mb-6">
          <h1 className="text-xl font-bold sm:text-2xl">새 백테스트</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            파라미터를 조정해서 시뮬레이션. 실행 시 ~30초~수분 소요.
          </p>
        </header>

        <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <Field label="시작일" hint="report_date 이후의 날짜 권장 (Y2024 사업보고서: 2025-03-12 이후)">
            <input
              type="date"
              required
              value={form.start}
              onChange={(e) => update("start", e.target.value)}
              className={INPUT}
            />
          </Field>
          <Field label="종료일">
            <input
              type="date"
              required
              value={form.end}
              onChange={(e) => update("end", e.target.value)}
              className={INPUT}
            />
          </Field>
          <Field label="초기 자본" hint="원 단위 (1억 = 100,000,000)">
            <input
              type="number"
              required
              min={1_000_000}
              step={1_000_000}
              value={form.capital}
              onChange={(e) => update("capital", Number(e.target.value))}
              className={INPUT}
            />
          </Field>
          <Field label="리밸런싱 주기">
            <select
              value={form.freq}
              onChange={(e) => update("freq", e.target.value as "monthly" | "quarterly")}
              className={INPUT}
            >
              <option value="monthly">매월</option>
              <option value="quarterly">매 분기</option>
            </select>
          </Field>
          <Field label="최대 보유 종목" hint="동등 가중 분산">
            <input
              type="number"
              required
              min={1}
              max={50}
              value={form.positions}
              onChange={(e) => update("positions", Number(e.target.value))}
              className={INPUT}
            />
          </Field>
          <Field label="최소 Buffett Score" hint="0~100. 80 = 가치통과 표준">
            <input
              type="number"
              required
              min={0}
              max={100}
              step={1}
              value={form.minScore}
              onChange={(e) => update("minScore", Number(e.target.value))}
              className={INPUT}
            />
          </Field>
          <Field label="최소 안전마진" hint="-1 ~ 1. 0.3 = 30% 할인 (Buffett 표준)">
            <input
              type="number"
              required
              min={-1}
              max={1}
              step={0.05}
              value={form.minMos}
              onChange={(e) => update("minMos", Number(e.target.value))}
              className={INPUT}
            />
          </Field>
          <Field label="거래비용 (round-trip 절반)" hint="0.004 = 0.4% (보수적). 한국 실제: ~0.002">
            <input
              type="number"
              required
              min={0}
              max={0.05}
              step={0.001}
              value={form.txCost}
              onChange={(e) => update("txCost", Number(e.target.value))}
              className={INPUT}
            />
          </Field>

          {error && (
            <div className="rounded bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? "실행 중... (수분 소요)" : "백테스트 실행"}
            </button>
            <button
              type="button"
              onClick={() => setForm(DEFAULTS)}
              disabled={busy}
              className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              기본값
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const INPUT =
  "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      {hint && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>}
      {children}
    </div>
  );
}
