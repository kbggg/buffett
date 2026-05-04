import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getNickname } from "@/lib/nickname";

/**
 * POST /api/profile/import
 * Body: { schema, portfolio, decisions, cashBalances, replace?: boolean }
 * - replace=true: 현재 데이터 삭제 후 import
 * - replace=false (default): 기존 데이터에 추가 (id 충돌 무시)
 */

type Row = Record<string, unknown>;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  if (b.schema !== "buffett-profile-v1") {
    return NextResponse.json({ error: "unknown schema" }, { status: 400 });
  }
  const portfolio = Array.isArray(b.portfolio) ? (b.portfolio as Row[]) : [];
  const decisions = Array.isArray(b.decisions) ? (b.decisions as Row[]) : [];
  const cashBalances = Array.isArray(b.cashBalances) ? (b.cashBalances as Row[]) : [];
  const replace = b.replace === true;

  const nickname = await getNickname();
  let inserted = { portfolio: 0, decisions: 0, cash: 0 };

  try {
    await db.transaction(async (tx) => {
      if (replace) {
        await tx.execute(sql`delete from portfolio where nickname = ${nickname}`);
        await tx.execute(sql`delete from decisions where nickname = ${nickname}`);
        await tx.execute(sql`delete from cash_balances where nickname = ${nickname}`);
      }
      for (const r of portfolio) {
        await tx.execute(sql`
          insert into portfolio (nickname, ticker, buy_date, buy_price, quantity, sell_date, sell_price, notes)
          values (
            ${nickname},
            ${String(r.ticker ?? "")},
            ${String(r.buy_date ?? "")},
            ${String(r.buy_price ?? "0")},
            ${Number(r.quantity ?? 0)},
            ${r.sell_date ? String(r.sell_date) : null},
            ${r.sell_price ? String(r.sell_price) : null},
            ${r.notes ? String(r.notes) : null}
          )
        `);
        inserted.portfolio++;
      }
      for (const r of decisions) {
        await tx.execute(sql`
          insert into decisions (nickname, ticker, decision_date, decision, reason, score_snapshot)
          values (
            ${nickname},
            ${String(r.ticker ?? "")},
            ${String(r.decision_date ?? "")},
            ${String(r.decision ?? "WATCH")},
            ${r.reason ? String(r.reason) : null},
            cast(${JSON.stringify(r.score_snapshot ?? null)} as jsonb)
          )
        `);
        inserted.decisions++;
      }
      for (const r of cashBalances) {
        await tx.execute(sql`
          insert into cash_balances (nickname, amount, source)
          values (
            ${nickname},
            ${String(r.amount ?? "0")},
            ${String(r.source ?? "imported")}
          )
        `);
        inserted.cash++;
      }
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  revalidatePath("/");
  revalidatePath("/portfolio");
  revalidatePath("/decisions");
  revalidatePath("/rankings");

  return NextResponse.json({ ok: true, nickname, inserted, replace });
}
