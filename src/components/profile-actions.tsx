"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProfileActions({ nickname }: { nickname: string }) {
  return (
    <div className="space-y-4">
      <ExportBox nickname={nickname} />
      <ImportBox />
      <ResetBox nickname={nickname} />
    </div>
  );
}

function ExportBox({ nickname }: { nickname: string }) {
  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900/50 dark:bg-blue-950/20">
      <h3 className="text-base font-bold text-blue-900 dark:text-blue-200">
        📥 데이터 내보내기
      </h3>
      <p className="mt-1 text-xs text-blue-800 dark:text-blue-300">
        {nickname}의 portfolio + 결정 로그 + 현금 잔액을 JSON 파일로 다운로드. 백업 또는 다른
        기기로 옮길 때.
      </p>
      <a
        href="/api/profile/export"
        download
        className="mt-3 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        JSON 다운로드
      </a>
    </section>
  );
}

function ImportBox() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!file) return;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch("/api/profile/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...json, replace }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "실패");
      setResult(
        `완료: portfolio ${j.inserted.portfolio} / 결정 ${j.inserted.decisions} / 현금 ${j.inserted.cash}건${replace ? " (기존 데이터 삭제 후 적용)" : ""}`,
      );
      setTimeout(() => router.refresh(), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <h3 className="text-base font-bold text-emerald-900 dark:text-emerald-200">
        📤 데이터 가져오기
      </h3>
      <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
        이전에 내보낸 JSON 파일을 현재 닉네임에 추가합니다.
      </p>
      <div className="mt-3 space-y-2">
        <input
          type="file"
          accept=".json,application/json"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-emerald-900 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-emerald-700 dark:text-emerald-200"
        />
        <label className="flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
          <input
            type="checkbox"
            checked={replace}
            onChange={(e) => setReplace(e.target.checked)}
          />
          기존 데이터 모두 삭제 후 가져오기 (덮어쓰기)
        </label>
        <button
          type="button"
          disabled={!file || busy}
          onClick={submit}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "처리 중..." : "가져오기"}
        </button>
        {result && <p className="text-xs text-emerald-800 dark:text-emerald-300">{result}</p>}
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    </section>
  );
}

function ResetBox({ nickname }: { nickname: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (confirmText !== nickname) return;
    if (
      !confirm(
        `정말 ${nickname}의 모든 데이터를 삭제할까요?\n포트폴리오, 결정 로그, 현금 잔액 — 영구 삭제됩니다.`,
      )
    )
      return;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/profile/reset", { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "실패");
      setResult(
        `삭제 완료: portfolio ${j.deleted.portfolio} / 결정 ${j.deleted.decisions} / 현금 ${j.deleted.cash}건`,
      );
      setConfirmText("");
      setTimeout(() => router.refresh(), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border-2 border-rose-300 bg-rose-50 p-5 dark:border-rose-800 dark:bg-rose-950/20">
      <h3 className="text-base font-bold text-rose-900 dark:text-rose-200">
        ⚠️ 프로필 초기화
      </h3>
      <p className="mt-1 text-xs text-rose-800 dark:text-rose-300">
        <strong>{nickname}</strong>의 모든 사용자 데이터를 영구 삭제합니다 (portfolio + 결정 로그 +
        현금). 종목/재무/점수 같은 분석 데이터는 그대로. 백업하지 않으면 복구 불가능.
      </p>
      <div className="mt-3 space-y-2">
        <p className="text-xs text-rose-800 dark:text-rose-300">
          확인을 위해 닉네임 <strong>{nickname}</strong>을 입력하세요:
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={nickname}
          className="w-48 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm dark:border-rose-700 dark:bg-zinc-900"
        />
        <button
          type="button"
          disabled={confirmText !== nickname || busy}
          onClick={submit}
          className="ml-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {busy ? "삭제 중..." : "초기화"}
        </button>
        {result && <p className="text-xs text-emerald-700 dark:text-emerald-400">{result}</p>}
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    </section>
  );
}
