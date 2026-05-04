"""내재가치 3종 계산 + 안전마진.

- DCF: 향후 N년 FCF + terminal value를 WACC으로 할인. 보수적 가정.
- Owner Earnings × multiple: Buffett 본인 정의를 단순화 (latest OE × 12).
- Graham: √(22.5 × EPS × BPS) — 정통 Graham number.
- intrinsic_avg: 3종의 중앙값 (median) — outlier 영향 최소화.
- 안전마진 = (intrinsic_avg - price) / intrinsic_avg.
- 결과는 모두 "주당 가격" 단위로 통일 (int 원).

데이터 부족 시 None 반환 (UI/분석에서 graceful 처리).
"""
from __future__ import annotations

from dataclasses import dataclass
from statistics import median
from typing import Optional

from analysis.score import Annual

# === 보수적 가정값 (한국 시장) ===
DCF_DISCOUNT_RATE = 0.09  # WACC 9% (한국 Rf 3% + ERP 6%)
DCF_TERMINAL_GROWTH = 0.025  # 장기 GDP 2.5%
DCF_PROJECTION_YEARS = 10
OWNER_EARNINGS_MULTIPLE = 12  # 보수적 (보통 10~15)
GRAHAM_FACTOR = 22.5  # √(22.5 × EPS × BPS) Graham 정통


@dataclass
class IntrinsicResult:
    dcf: Optional[float]  # 주당 적정가
    owner_earnings: Optional[float]
    graham: Optional[float]
    average: Optional[float]  # median of available
    margin_of_safety: Optional[float]  # (intrinsic - price) / intrinsic. 음수 = 고평가.
    details: dict


def _dcf_per_share(
    latest_fcf: float,
    shares_outstanding: int,
    growth_rate: float = 0.05,
    years: int = DCF_PROJECTION_YEARS,
    discount: float = DCF_DISCOUNT_RATE,
    terminal_growth: float = DCF_TERMINAL_GROWTH,
) -> Optional[float]:
    """단순화된 2단계 DCF.

    - 1단계: years 동안 growth_rate 로 FCF 성장
    - terminal: Gordon growth model
    - 모두 현재가치로 할인 → 총 기업가치 → 주당 가치
    """
    if latest_fcf <= 0 or shares_outstanding <= 0:
        return None
    pv = 0.0
    fcf = latest_fcf
    for t in range(1, years + 1):
        fcf = fcf * (1 + growth_rate)
        pv += fcf / ((1 + discount) ** t)
    terminal_fcf = fcf * (1 + terminal_growth)
    terminal_value = terminal_fcf / (discount - terminal_growth)
    pv += terminal_value / ((1 + discount) ** years)
    return pv / shares_outstanding


def _owner_earnings_per_share(
    annuals: list[Annual], shares_outstanding: int
) -> Optional[float]:
    """Latest OE × multiple / shares. OE = OCF - CapEx."""
    if not annuals or shares_outstanding <= 0:
        return None
    latest = annuals[0]
    if latest.operating_cash_flow is None or latest.capex is None:
        return None
    oe = latest.operating_cash_flow - latest.capex
    if oe <= 0:
        return None
    return (oe * OWNER_EARNINGS_MULTIPLE) / shares_outstanding


def _graham_value(eps: Optional[float], bps: Optional[float]) -> Optional[float]:
    if not eps or not bps or eps <= 0 or bps <= 0:
        return None
    return (GRAHAM_FACTOR * eps * bps) ** 0.5


def _bps(annuals: list[Annual], shares_outstanding: int) -> Optional[float]:
    """BPS = 지배기업주주귀속자본 / shares_outstanding (book value per share).

    표준은 지배지분만 사용 (KIS/네이버와 일치). 미수집 시 전체 자본 폴백.
    """
    if not annuals or shares_outstanding <= 0:
        return None
    eq = annuals[0].equity_for_per_share()
    if eq is None:
        return None
    return eq / shares_outstanding


def _growth_rate(annuals: list[Annual]) -> float:
    """매출 성장률 추정 — DCF용. 가용 연도 부족하면 보수적 5%."""
    if len(annuals) < 2:
        return 0.05
    sorted_a = sorted(annuals, key=lambda a: a.fiscal_year)
    latest = sorted_a[-1]
    earliest = sorted_a[0]
    n = latest.fiscal_year - earliest.fiscal_year
    if n <= 0 or not earliest.revenue or not latest.revenue or earliest.revenue <= 0:
        return 0.05
    cagr = (latest.revenue / earliest.revenue) ** (1 / n) - 1
    # 보수적 캡: -10% ~ +15% 사이로 클립
    return max(-0.10, min(0.15, cagr))


def compute_intrinsic(
    annuals: list[Annual],
    shares_outstanding: Optional[int],
    current_price: Optional[float],
) -> IntrinsicResult:
    if not annuals or not shares_outstanding:
        return IntrinsicResult(
            None, None, None, None, None,
            {"reason": "no annuals or no shares"},
        )
    annuals = sorted(annuals, key=lambda a: a.fiscal_year, reverse=True)
    latest = annuals[0]

    # FCF
    latest_fcf = None
    if latest.operating_cash_flow is not None and latest.capex is not None:
        latest_fcf = latest.operating_cash_flow - latest.capex

    growth = _growth_rate(annuals)

    dcf = _dcf_per_share(latest_fcf, shares_outstanding, growth) if latest_fcf else None
    oe = _owner_earnings_per_share(annuals, shares_outstanding)
    bps = _bps(annuals, shares_outstanding)
    graham = _graham_value(latest.eps, bps)

    candidates = [v for v in (dcf, oe, graham) if v is not None and v > 0]
    avg = median(candidates) if candidates else None

    mos = None
    if avg and current_price and avg > 0:
        mos = (avg - current_price) / avg

    return IntrinsicResult(
        dcf=dcf,
        owner_earnings=oe,
        graham=graham,
        average=avg,
        margin_of_safety=mos,
        details={
            "growth_rate_used": round(growth, 4),
            "latest_fcf": latest_fcf,
            "bps": bps,
            "current_price": current_price,
            "n_methods_available": len(candidates),
        },
    )
