import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getNickname } from "@/lib/nickname";

/**
 * DELETE /api/profile/reset
 * 현재 닉네임의 portfolio + decisions + cash_balances 모두 삭제.
 * 공유 데이터(stocks/scores 등)는 건드리지 않음.
 */
export async function DELETE() {
  const nickname = await getNickname();
  let portfolioCount = 0;
  let decisionsCount = 0;
  let cashCount = 0;

  await db.transaction(async (tx) => {
    const p = await tx.execute(sql`delete from portfolio where nickname = ${nickname}`);
    portfolioCount = (p as unknown as { rowCount?: number }).rowCount ?? 0;
    const d = await tx.execute(sql`delete from decisions where nickname = ${nickname}`);
    decisionsCount = (d as unknown as { rowCount?: number }).rowCount ?? 0;
    const c = await tx.execute(sql`delete from cash_balances where nickname = ${nickname}`);
    cashCount = (c as unknown as { rowCount?: number }).rowCount ?? 0;
  });

  revalidatePath("/");
  revalidatePath("/portfolio");
  revalidatePath("/decisions");
  revalidatePath("/rankings");

  return NextResponse.json({
    ok: true,
    nickname,
    deleted: { portfolio: portfolioCount, decisions: decisionsCount, cash: cashCount },
  });
}
