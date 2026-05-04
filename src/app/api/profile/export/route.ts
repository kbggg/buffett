import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getNickname } from "@/lib/nickname";

/**
 * GET /api/profile/export
 * 현재 닉네임의 portfolio + decisions + cash_balances JSON 다운로드.
 */
export async function GET() {
  const nickname = await getNickname();
  const [portfolio, decisions, cashBalances] = await Promise.all([
    db.execute(sql`select * from portfolio where nickname = ${nickname}`),
    db.execute(sql`select * from decisions where nickname = ${nickname}`),
    db.execute(sql`select * from cash_balances where nickname = ${nickname}`),
  ]);

  const data = {
    schema: "buffett-profile-v1",
    exported_at: new Date().toISOString(),
    nickname,
    portfolio: portfolio.map(rowToObj),
    decisions: decisions.map(rowToObj),
    cashBalances: cashBalances.map(rowToObj),
  };

  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="buffett-${nickname}-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

function rowToObj(r: Record<string, unknown>): Record<string, unknown> {
  // 날짜는 string으로, numeric은 그대로 보존
  return Object.fromEntries(
    Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]),
  );
}
