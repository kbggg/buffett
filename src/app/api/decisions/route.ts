import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getNickname } from "@/lib/nickname";

/**
 * POST /api/decisions    — 결정 기록
 * DELETE /api/decisions?id=N
 */

export async function POST(req: NextRequest) {
  const body = await req.json();
  const ticker = String(body.ticker ?? "").trim();
  const decisionDate = String(body.decisionDate ?? "");
  const decision = String(body.decision ?? "");
  const reason = body.reason ? String(body.reason) : null;
  // 결정 시점 스냅샷 — UI에서 보내는 것 사용
  const snapshot = body.snapshot ?? null;

  if (!ticker || !/^\d{4}-\d{2}-\d{2}$/.test(decisionDate)) {
    return NextResponse.json({ error: "ticker, decisionDate(YYYY-MM-DD) required" }, { status: 400 });
  }
  if (!["BUY", "SELL", "WATCH", "SKIP"].includes(decision)) {
    return NextResponse.json({ error: "decision must be BUY|SELL|WATCH|SKIP" }, { status: 400 });
  }

  const nickname = await getNickname();
  await db.execute(sql`
    insert into decisions (nickname, ticker, decision_date, decision, reason, score_snapshot)
    values (${nickname}, ${ticker}, ${decisionDate}, ${decision}, ${reason}, cast(${JSON.stringify(snapshot)} as jsonb))
  `);
  revalidatePath("/decisions"); return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  const nickname = await getNickname();
  await db.execute(sql`delete from decisions where id = ${id} and nickname = ${nickname}`);
  revalidatePath("/decisions"); return NextResponse.json({ ok: true });
}
