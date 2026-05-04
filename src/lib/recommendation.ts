/**
 * 매수/매도 권장 — Buffett 원칙 기반 규칙.
 *
 * CLAUDE.md "충동 매수 유도 알림 X" / "자동매매 X" 원칙 준수.
 * - 모든 권장은 객관적 지표 임계값 기반
 * - "긴급/즉시" 같은 자극적 표현 최소화
 * - 매수/매도 결정은 사용자 본인
 */

export type Action =
  | "BUY_NOW"
  | "BUY_GRADUAL"
  | "WATCH"
  | "HOLD"
  | "SELL_REVIEW"
  | "SELL_URGENT"
  | "PASS";

export type Recommendation = {
  action: Action;
  label: string;
  color: "green" | "blue" | "amber" | "zinc" | "orange" | "rose" | "neutral";
  reason: string;
  // 매수/매도 가격 가이드 (intrinsic 기반)
  buyTargetPrice: number | null;  // intrinsic × 0.70
  buyStages: { stage: number; price: number; mos: string }[];
  sellTargetPrice: number | null; // intrinsic × 1.00
  sellUrgentPrice: number | null; // intrinsic × 1.20
};

const LABEL: Record<Action, string> = {
  BUY_NOW: "매수 적기",
  BUY_GRADUAL: "분할 매수",
  WATCH: "관찰",
  HOLD: "계속 보유",
  SELL_REVIEW: "매도 검토",
  SELL_URGENT: "긴급 매도",
  PASS: "패스",
};

const COLOR: Record<Action, Recommendation["color"]> = {
  BUY_NOW: "green",
  BUY_GRADUAL: "blue",
  WATCH: "amber",
  HOLD: "neutral",
  SELL_REVIEW: "orange",
  SELL_URGENT: "rose",
  PASS: "zinc",
};

export type RecommendationInput = {
  buffettScore: number | null;
  marginOfSafety: number | null;
  timingSignal: "BUY" | "WATCH" | "NEUTRAL" | null;
  intrinsicAvg: number | null;
  recentNegativeEvents: number; // 최근 90일 악재 공시 카운트
  isHolding: boolean; // 포트폴리오 보유 여부
  buyPrice?: number; // 보유 중일 때 매수가
};

function priceGuides(intrinsic: number | null) {
  if (!intrinsic || intrinsic <= 0) {
    return {
      buyTargetPrice: null,
      buyStages: [],
      sellTargetPrice: null,
      sellUrgentPrice: null,
    };
  }
  return {
    buyTargetPrice: Math.round(intrinsic * 0.7),
    buyStages: [
      { stage: 1, price: Math.round(intrinsic * 0.8), mos: "20%" },
      { stage: 2, price: Math.round(intrinsic * 0.7), mos: "30%" },
      { stage: 3, price: Math.round(intrinsic * 0.6), mos: "40%" },
    ],
    sellTargetPrice: Math.round(intrinsic),
    sellUrgentPrice: Math.round(intrinsic * 1.2),
  };
}

export function recommend(inp: RecommendationInput): Recommendation {
  const score = inp.buffettScore ?? 0;
  const mos = inp.marginOfSafety ?? 0;
  const guides = priceGuides(inp.intrinsicAvg);

  // 보유 중인 경우 — 매도 우선 검토
  if (inp.isHolding) {
    if (score < 60 || mos < -0.2 || inp.recentNegativeEvents >= 2) {
      return {
        action: "SELL_URGENT",
        label: LABEL.SELL_URGENT,
        color: COLOR.SELL_URGENT,
        reason:
          score < 60
            ? `Buffett Score ${score.toFixed(0)} (60 이하) — 가치 훼손`
            : mos < -0.2
              ? `안전마진 ${(mos * 100).toFixed(0)}% — 적정가 대비 20%↑ 고평가`
              : `최근 90일 악재 공시 ${inp.recentNegativeEvents}건`,
        ...guides,
      };
    }
    if (score < 70 || mos < 0 || inp.recentNegativeEvents >= 1) {
      return {
        action: "SELL_REVIEW",
        label: LABEL.SELL_REVIEW,
        color: COLOR.SELL_REVIEW,
        reason:
          score < 70
            ? `Score ${score.toFixed(0)} (70 이하) — 매도 검토`
            : mos < 0
              ? `안전마진 ${(mos * 100).toFixed(0)}% (음수) — 적정가 도달`
              : `최근 악재 공시 ${inp.recentNegativeEvents}건`,
        ...guides,
      };
    }
    return {
      action: "HOLD",
      label: LABEL.HOLD,
      color: COLOR.HOLD,
      reason: `가치 유지 (Score ${score.toFixed(0)}, MoS ${(mos * 100).toFixed(0)}%) — 매도 신호 없음`,
      ...guides,
    };
  }

  // 미보유 — 매수 권장 검토
  if (score >= 80 && mos >= 0.3 && inp.timingSignal === "BUY") {
    return {
      action: "BUY_NOW",
      label: LABEL.BUY_NOW,
      color: COLOR.BUY_NOW,
      reason: `가치(${score.toFixed(0)}) + 안전마진(${(mos * 100).toFixed(0)}%) + 타이밍 BUY 3중 통과`,
      ...guides,
    };
  }
  if (score >= 80 && mos >= 0.3) {
    return {
      action: "BUY_GRADUAL",
      label: LABEL.BUY_GRADUAL,
      color: COLOR.BUY_GRADUAL,
      reason: `가치 통과 (Score ${score.toFixed(0)}, MoS ${(mos * 100).toFixed(0)}%) — 타이밍 대기, 분할 매수 권장`,
      ...guides,
    };
  }
  if (score >= 70 && mos >= 0.15) {
    return {
      action: "WATCH",
      label: LABEL.WATCH,
      color: COLOR.WATCH,
      reason: `가치 부분 통과 (Score ${score.toFixed(0)}, MoS ${(mos * 100).toFixed(0)}%) — 안전마진 30% 도달까지 대기`,
      ...guides,
    };
  }
  if (score < 60 || mos < -0.2) {
    return {
      action: "PASS",
      label: LABEL.PASS,
      color: COLOR.PASS,
      reason:
        score < 60
          ? `Score ${score.toFixed(0)} 너무 낮음`
          : `안전마진 ${(mos * 100).toFixed(0)}% (-20% 미만) 너무 비쌈`,
      ...guides,
    };
  }
  return {
    action: "PASS",
    label: LABEL.PASS,
    color: COLOR.PASS,
    reason: `기준 미달 (Score ${score.toFixed(0)}, MoS ${(mos * 100).toFixed(0)}%)`,
    ...guides,
  };
}
