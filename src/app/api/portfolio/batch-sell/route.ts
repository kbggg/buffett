import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getNickname } from "@/lib/nickname";

/**
 * POST /api/portfolio/batch-sell
 * Body: { sellDate, sells: [{id, sellPrice}] }
 * 트랜잭션:
 *   1. portfolio 행들 sell_date/sell_price 업데이트
 *   2. 각 종목의 매도금액 합계를 cash_balances에 1행으로 적립
 */

type SellItem = { id: number; sellPrice: number };

export async function POST(req: NextRequest) {
  const body = await req.json();
  const sellDate = String(body.sellDate ?? "");
  const sells: SellItem[] = Array.isArray(body.sells) ? body.sells : [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(sellDate)) {
    return NextResponse.json({ error: "sellDate(YYYY-MM-DD) required" }, { status: 400 });
  }
  if (sells.length === 0) {
    return NextResponse.json({ error: "sells required" }, { status: 400 });
  }
  for (const s of sells) {
    if (!Number.isInteger(s.id) || !Number.isFinite(s.sellPrice) || s.sellPrice <= 0) {
      return NextResponse.json({ error: `invalid: ${JSON.stringify(s)}` }, { status: 400 });
    }
  }

  const nickname = await getNickname();
  let totalProceeds = 0;
  let count = 0;

  try {
    await db.transaction(async (tx) => {
      for (const s of sells) {
        const r = await tx.execute(sql`
          select quantity, ticker from portfolio
          where id = ${s.id} and nickname = ${nickname} and sell_date is null
        `);
        if (r.length === 0) continue;
        const qty = Number(r[0].quantity);
        const proceeds = Math.round(qty * s.sellPrice);
        await tx.execute(sql`
          update portfolio set sell_date = ${sellDate}, sell_price = ${String(s.sellPrice)}
          where id = ${s.id} and nickname = ${nickname}
        `);
        totalProceeds += proceeds;
        count++;
      }
      if (totalProceeds > 0) {
        await tx.execute(sql`
          insert into cash_balances (nickname, amount, source)
          values (${nickname}, ${String(totalProceeds)}, ${`${sellDate} 일괄매도 ${count}종목`})
        `);
      }
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  revalidatePath("/");
  revalidatePath("/portfolio");
  revalidatePath("/rankings");
  return NextResponse.json({ ok: true, count, totalProceeds });
}
