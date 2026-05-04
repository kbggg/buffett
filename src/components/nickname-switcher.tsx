"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function NicknameSwitcher({ current }: { current: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!value.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/nickname", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname: value.trim() }),
      });
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          type="text"
          maxLength={30}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-32 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          onClick={save}
          disabled={busy}
          className="rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          ✓
        </button>
        <button
          onClick={() => {
            setEditing(false);
            setValue(current);
          }}
          className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        title="닉네임 변경"
      >
        <span>👤</span>
        <span className="font-medium">{current}</span>
        <span className="text-zinc-400">✎</span>
      </button>
      <Link
        href="/profile"
        className="rounded-full border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        title="프로필 관리"
      >
        ⚙️
      </Link>
    </div>
  );
}
