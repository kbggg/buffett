"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type DecisionType = "BUY" | "SELL" | "WATCH" | "SKIP";

const LABEL: Record<DecisionType, string> = {
  BUY: "매수",
  SELL: "매도",
  WATCH: "관찰",
  SKIP: "패스",
};

const COLOR: Record<DecisionType, string> = {
  BUY: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  SELL: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  WATCH: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  SKIP: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export function DecisionForm({
  ticker,
  snapshot,
}: {
  ticker: string;
  snapshot: { score: number | null; mos: number | null; price: number | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<DecisionType>("WATCH");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticker,
          decisionDate: new Date().toISOString().slice(0, 10),
          decision,
          reason: reason || null,
          snapshot,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? "실패");
      }
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        + 결정 기록
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/30">
      <p className="text-xs text-zinc-500">
        결정 시점 점수 자동 저장 (Score {snapshot.score?.toFixed(0) ?? "-"}, MoS{" "}
        {snapshot.mos !== null ? `${(snapshot.mos * 100).toFixed(0)}%` : "-"}, 가격{" "}
        {snapshot.price?.toLocaleString() ?? "-"}원). 1년 후 회고용.
      </p>
      <div className="flex flex-wrap gap-2">
        {(["BUY", "SELL", "WATCH", "SKIP"] as DecisionType[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDecision(d)}
            className={
              "rounded-lg px-3 py-1.5 text-sm font-medium border-2 " +
              (decision === d
                ? COLOR[d] + " border-current"
                : "bg-white text-zinc-700 border-transparent dark:bg-zinc-900 dark:text-zinc-300")
            }
          >
            {LABEL[d]}
          </button>
        ))}
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="결정 이유 (예: 영업이익률 회복 확신, 단기 과열 우려 매도, ...)"
        rows={3}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "저장 중..." : "기록"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
        >
          취소
        </button>
      </div>
    </form>
  );
}
