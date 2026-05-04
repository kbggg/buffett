import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getNickname } from "@/lib/nickname";

/**
 * POST /api/portfolio    — 신규 매수 등록
 * PATCH /api/portfolio   — 매도 처리 (id, sell_date, sell_price)
 * DELETE /api/portfolio?id=N — 삭제
 */

export async function POST(req: NextRequest) {
  const body = await req.json();
  const ticker = String(body.ticker ?? "").trim();
  const buyDate = String(body.buyDate ?? "");
  const buyPrice = Number(body.buyPrice);
  const quantity = Number(body.quantity);
  const notes = body.notes ? String(body.notes) : null;

  if (!ticker || !/^\d{4}-\d{2}-\d{2}$/.test(buyDate)) {
    return NextResponse.json({ error: "ticker, buyDate(YYYY-MM-DD) required" }, { status: 400 });
  }
  if (!Number.isFinite(buyPrice) || buyPrice <= 0) {
    return NextResponse.json({ error: "buyPrice must be positive" }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "quantity must be positive integer" }, { status: 400 });
  }

  // ticker 존재 확인
  const exists = await db.execute(sql`select 1 from stocks where ticker = ${ticker} limit 1`);
  if (exists.length === 0) {
    return NextResponse.json({ error: `ticker ${ticker} not found in stocks` }, { status: 404 });
  }

  const nickname = await getNickname();
  await db.execute(sql`
    insert into portfolio (nickname, ticker, buy_date, buy_price, quantity, notes)
    values (${nickname}, ${ticker}, ${buyDate}, ${String(buyPrice)}, ${quantity}, ${notes})
  `);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const id = Number(body.id);
  const sellDate = String(body.sellDate ?? "");
  const sellPrice = Number(body.sellPrice);
  if (!Number.isInteger(id) || !/^\d{4}-\d{2}-\d{2}$/.test(sellDate) || !Number.isFinite(sellPrice)) {
    return NextResponse.json({ error: "id, sellDate, sellPrice required" }, { status: 400 });
  }
  const nickname = await getNickname();
  // 매도 시: 1) sell 정보 update + 2) 매도금액(qty × sell_price)을 cash_balances 로
  await db.transaction(async (tx) => {
    const r = await tx.execute(sql`
      select quantity, ticker from portfolio where id = ${id} and nickname = ${nickname}
    `);
    if (r.length === 0) throw new Error("not found");
    const qty = Number(r[0].quantity);
    const ticker = String(r[0].ticker);
    const proceeds = Math.round(qty * sellPrice);
    await tx.execute(sql`
      update portfolio set sell_date = ${sellDate}, sell_price = ${String(sellPrice)}
      where id = ${id} and nickname = ${nickname}
    `);
    if (proceeds > 0) {
      await tx.execute(sql`
        insert into cash_balances (nickname, amount, source)
        values (${nickname}, ${String(proceeds)}, ${`${sellDate} ${ticker} 매도`})
      `);
    }
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const nickname = await getNickname();
  await db.execute(sql`delete from portfolio where id = ${id} and nickname = ${nickname}`);
  return NextResponse.json({ ok: true });
}
