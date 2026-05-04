"use client";

import { useState } from "react";
import { GLOSSARY } from "@/lib/glossary";

/**
 * 용어를 점선 밑줄로 표시. 클릭 시 popover로 정의/설명 표시.
 * <Term name="ROE">ROE</Term>  또는 <Term name="PBR" /> (이름 표시)
 */
export function Term({
  name,
  children,
}: {
  name: string;
  children?: React.ReactNode;
}) {
  const term = GLOSSARY[name];
  const [open, setOpen] = useState(false);

  if (!term) {
    return <span className="text-rose-500">[{name}?]</span>;
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="cursor-help border-b border-dotted border-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        {children ?? term.name}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 top-full z-20 mt-1 w-80 rounded-lg border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-2 flex items-baseline justify-between">
              <h4 className="text-sm font-bold">{term.name}</h4>
              <span className="text-xs text-zinc-500">{term.korean}</span>
            </div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {term.oneLiner}
            </p>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
              {term.description}
            </p>
            <div className="mt-3 border-t border-zinc-100 pt-2 dark:border-zinc-800">
              <p className="text-xs">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">왜 중요? </span>
                <span className="text-zinc-600 dark:text-zinc-400">{term.whyMatter}</span>
              </p>
            </div>
            {term.example && (
              <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                <span className="font-medium">예) </span>
                {term.example}
              </p>
            )}
            {term.buffett && (
              <div className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                <span className="font-medium">Buffett: </span>
                {term.buffett}
              </div>
            )}
          </div>
        </>
      )}
    </span>
  );
}
