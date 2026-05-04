import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

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

  await db.execute(sql`
    insert into portfolio (ticker, buy_date, buy_price, quantity, notes)
    values (${ticker}, ${buyDate}, ${String(buyPrice)}, ${quantity}, ${notes})
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
  await db.execute(sql`
    update portfolio set sell_date = ${sellDate}, sell_price = ${String(sellPrice)}
    where id = ${id}
  `);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await db.execute(sql`delete from portfolio where id = ${id}`);
  return NextResponse.json({ ok: true });
}
