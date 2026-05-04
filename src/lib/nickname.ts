import { cookies } from "next/headers";

export const NICKNAME_COOKIE = "buffett-nickname";
export const DEFAULT_NICKNAME = "me";

/**
 * Server-side: 현재 닉네임 (cookie에서). 없으면 'me'.
 */
export async function getNickname(): Promise<string> {
  const c = await cookies();
  const v = c.get(NICKNAME_COOKIE)?.value?.trim();
  return v && v.length > 0 ? v.slice(0, 30) : DEFAULT_NICKNAME;
}

export function sanitizeNickname(input: string): string {
  return input.trim().slice(0, 30) || DEFAULT_NICKNAME;
}
