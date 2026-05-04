import { NextRequest, NextResponse } from "next/server";
import { NICKNAME_COOKIE, sanitizeNickname } from "@/lib/nickname";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const nickname = sanitizeNickname(String(body.nickname ?? ""));
  const res = NextResponse.json({ ok: true, nickname });
  res.cookies.set({
    name: NICKNAME_COOKIE,
    value: nickname,
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 5, // 5년
    httpOnly: false, // client에서 읽기 가능 (디버그용)
    sameSite: "lax",
  });
  return res;
}
