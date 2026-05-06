/**
 * 분기 리밸런스 — 백테스트 규칙(분기말 강제 점검)을 운영에도 적용.
 *
 * 백테스트와 동일한 시점에 사용자도 "지금 점검 시기" 알림을 받아야
 * 시뮬레이션과 실 운영의 행동이 일치한다.
 */

const QUARTER_END_MONTHS = [3, 6, 9, 12] as const;

/** 다음 분기말 (현재 또는 미래 중 가장 가까운 3/31, 6/30, 9/30, 12/31). */
export function nextQuarterEnd(today: Date = new Date()): Date {
  const y = today.getFullYear();
  for (const m of QUARTER_END_MONTHS) {
    const last = new Date(y, m, 0); // m월의 0일 = 직전월 마지막일이지만 여기선 m을 0-indexed로 → m월의 마지막일
    last.setHours(0, 0, 0, 0);
    const t = new Date(today);
    t.setHours(0, 0, 0, 0);
    if (last >= t) return last;
  }
  // 12/31 지났으면 다음 해 3/31
  return new Date(y + 1, 3, 0);
}

/** today와 분기말의 일수 차 (분기말 - today). 음수면 이미 지남. */
export function daysToNextQuarterEnd(today: Date = new Date()): number {
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  const qe = nextQuarterEnd(t);
  const ms = qe.getTime() - t.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/** 분기말 ±N일 안에 들어오면 "리밸런스 모드". 기본 ±7일. */
export function isRebalanceWindow(today: Date = new Date(), windowDays = 7): boolean {
  return daysToNextQuarterEnd(today) <= windowDays;
}

/** UI 표시용: "2026-06-30 (D-54)" 같은 라벨. */
export function formatNextRebalance(today: Date = new Date()): {
  date: string;
  daysLeft: number;
  inWindow: boolean;
} {
  const qe = nextQuarterEnd(today);
  const days = daysToNextQuarterEnd(today);
  return {
    date: qe.toISOString().slice(0, 10),
    daysLeft: days,
    inWindow: isRebalanceWindow(today),
  };
}
