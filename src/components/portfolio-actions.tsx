"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const INPUT =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950";

export function AddPositionForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    ticker: "",
    buyDate: new Date().toISOString().slice(0, 10),
    buyPrice: "",
    quantity: "",
    notes: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticker: form.ticker.padStart(6, "0"),
          buyDate: form.buyDate,
          buyPrice: Number(form.buyPrice),
          quantity: Number(form.quantity),
          notes: form.notes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "실패");
      setForm({ ticker: "", buyDate: form.buyDate, buyPrice: "", quantity: "", notes: "" });
      setOpen(false);
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
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
      >
        + 매수 등록
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <input
          required
          placeholder="티커 (예: 005930)"
          value={form.ticker}
          onChange={(e) => setForm({ ...form, ticker: e.target.value })}
          className={INPUT}
        />
        <input
          required
          type="date"
          value={form.buyDate}
          onChange={(e) => setForm({ ...form, buyDate: e.target.value })}
          className={INPUT}
        />
        <input
          required
          type="number"
          placeholder="매수가"
          value={form.buyPrice}
          onChange={(e) => setForm({ ...form, buyPrice: e.target.value })}
          className={INPUT}
        />
        <input
          required
          type="number"
          placeholder="수량"
          value={form.quantity}
          onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          className={INPUT}
        />
        <input
          placeholder="메모 (선택)"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className={INPUT}
        />
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "저장 중..." : "저장"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          취소
        </button>
      </div>
    </form>
  );
}

export function SellButton({ id, ticker }: { id: number; ticker: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sellDate, setSellDate] = useState(new Date().toISOString().slice(0, 10));
  const [sellPrice, setSellPrice] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch("/api/portfolio", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, sellDate, sellPrice: Number(sellPrice) }),
      });
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deletePosition() {
    if (!confirm(`${ticker} 보유 기록을 삭제할까요?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/portfolio?id=${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex gap-1">
        <button
          onClick={() => setOpen(true)}
          className="rounded bg-rose-100 px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-200 dark:bg-rose-950 dark:text-rose-300"
        >
          매도
        </button>
        <button
          onClick={deletePosition}
          disabled={busy}
          className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700"
        >
          삭제
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex gap-1">
      <input
        required
        type="date"
        value={sellDate}
        onChange={(e) => setSellDate(e.target.value)}
        className="w-28 rounded border border-zinc-300 px-1 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
      />
      <input
        required
        type="number"
        placeholder="매도가"
        value={sellPrice}
        onChange={(e) => setSellPrice(e.target.value)}
        className="w-20 rounded border border-zinc-300 px-1 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-rose-600 px-2 py-0.5 text-xs text-white hover:bg-rose-700"
      >
        ✓
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded border border-zinc-300 px-2 py-0.5 text-xs dark:border-zinc-700"
      >
        ✕
      </button>
    </form>
  );
}
