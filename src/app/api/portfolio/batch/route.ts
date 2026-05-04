import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getNickname } from "@/lib/nickname";

/**
 * POST /api/portfolio/batch
 * Body: {
 *   date: string,
 *   allocations: [{ticker, qty, price}],
 *   leftover: number,
 *   capital: number
 * }
 * 트랜잭션으로 portfolio 다중 INSERT + cash_balances 1 INSERT.
 */

type Allocation = { ticker: string; qty: number; price: number };

export async function POST(req: NextRequest) {
  const body = await req.json();
  const date = String(body.date ?? "");
  const allocations: Allocation[] = Array.isArray(body.allocations) ? body.allocations : [];
  const leftover = Number(body.leftover ?? 0);
  const capital = Number(body.capital ?? 0);
  const note = body.note ? String(body.note) : `${date} 일괄매수 (자본 ${capital.toLocaleString()}원)`;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date(YYYY-MM-DD) required" }, { status: 400 });
  }
  if (allocations.length === 0) {
    return NextResponse.json({ error: "allocations required" }, { status: 400 });
  }
  for (const a of allocations) {
    if (!a.ticker || !Number.isInteger(a.qty) || a.qty <= 0 || !Number.isFinite(a.price)) {
      return NextResponse.json({ error: `invalid allocation: ${JSON.stringify(a)}` }, { status: 400 });
    }
  }

  const nickname = await getNickname();
  // 트랜잭션
  try {
    await db.transaction(async (tx) => {
      for (const a of allocations) {
        await tx.execute(sql`
          insert into portfolio (nickname, ticker, buy_date, buy_price, quantity, notes)
          values (${nickname}, ${a.ticker}, ${date}, ${String(a.price)}, ${a.qty}, ${note})
        `);
      }
      if (Math.round(leftover) > 0) {
        await tx.execute(sql`
          insert into cash_balances (nickname, amount, source)
          values (${nickname}, ${String(Math.round(leftover))}, ${`${date} 일괄매수 잔여`})
        `);
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  revalidatePath("/");
  revalidatePath("/portfolio");
  revalidatePath("/rankings");
  return NextResponse.json({ ok: true, count: allocations.length });
}
