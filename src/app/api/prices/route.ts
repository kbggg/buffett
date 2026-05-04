import { NextRequest, NextResponse } from "next/server";
import { getPriceSeries } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  const days = Number(req.nextUrl.searchParams.get("days") ?? 365);
  if (!ticker) {
    return NextResponse.json({ error: "ticker required" }, { status: 400 });
  }
  if (!Number.isFinite(days) || days < 1 || days > 365 * 10) {
    return NextResponse.json({ error: "invalid days" }, { status: 400 });
  }
  const data = await getPriceSeries(ticker, days);
  return NextResponse.json(data);
}
