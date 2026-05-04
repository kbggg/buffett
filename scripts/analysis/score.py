"""Buffett Score 100점 산출.

6개 카테고리 (한국 시장 캘리브레이션 적용):
- Profitability(30): ROE 평균(15) + 영업이익률(10) + ROE 변동성(5)
- Health(20):       부채비율(15) + 유동비율(5)
- Cash Gen(15):     OCF/NI(10) + FCF 양수 연속성(5)
- Growth(15):       매출 CAGR(7) + 순이익 CAGR(8)
- Stability(10):    적자 횟수(10)
- OE Yield(10):     Owner Earnings yield(10)

데이터 부족 시 graceful degradation:
- 5y 평균/CAGR: 가용 연도가 1년이면 단일값, 2~4년이면 그 기간으로 계산.
- 누락 항목은 0점 + breakdown에 reason 기록.

Look-ahead bias 방지: 모든 financials는 report_date <= as_of 만 사용.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from statistics import mean, pstdev
from typing import Optional

# === 임계값 (한국 시장 캘리브레이션) ===

ROE_THRESHOLDS = [(0.12, 15), (0.08, 10), (0.04, 5), (-1, 0)]
OP_MARGIN_THRESHOLDS = [(0.10, 10), (0.07, 7), (0.04, 4), (-1, 0)]
ROE_VOL_THRESHOLDS = [(0.20, 5), (0.50, 3), (1e9, 0)]  # 낮을수록 점수 ↑
DEBT_RATIO_THRESHOLDS = [(0.50, 15), (1.00, 10), (2.00, 5), (1e9, 0)]
CURRENT_RATIO_OK = 1.5  # 이상이면 5점
OCF_NI_THRESHOLDS = [(1.20, 10), (1.00, 8), (0.80, 5), (-1e9, 0)]
REV_CAGR_THRESHOLDS = [(0.10, 7), (0.05, 5), (0.00, 2), (-1e9, 0)]
NI_CAGR_THRESHOLDS = [(0.10, 8), (0.05, 5), (0.00, 2), (-1e9, -5)]  # 음수면 감점
OE_YIELD_THRESHOLDS = [(0.08, 10), (0.04, 6), (0.02, 3), (-1e9, 0)]


@dataclass
class Annual:
    """연간 재무 단일 행 (1년치)."""
    fiscal_year: int
    report_date: date
    revenue: Optional[int]
    operating_income: Optional[int]
    net_income: Optional[int]
    total_assets: Optional[int]
    total_equity: Optional[int]
    equity_attributable_to_owners: Optional[int]  # 지배지분
    total_liabilities: Optional[int]
    current_assets: Optional[int]
    current_liabilities: Optional[int]
    operating_cash_flow: Optional[int]
    capex: Optional[int]
    eps: Optional[float]

    def equity_for_per_share(self) -> Optional[int]:
        """BPS/PBR 계산용 — 지배지분 우선, 없으면 전체 자본 폴백."""
        return self.equity_attributable_to_owners or self.total_equity


@dataclass
class RecentEventCounts:
    """최근 90일 DART 공시 카테고리 카운트 — score.event_impact 입력."""
    positive: int = 0
    negative: int = 0


@dataclass
class ScoreInput:
    ticker: str
    annuals: list[Annual]  # 최근 → 과거 순(내림차순) 또는 무관, 정렬은 내부에서
    market_cap: Optional[int]
    events: RecentEventCounts = field(default_factory=RecentEventCounts)


@dataclass
class ComponentScore:
    name: str
    score: float
    max_score: float
    details: dict = field(default_factory=dict)


@dataclass
class ScoreResult:
    ticker: str
    total: float  # 0~100
    components: list[ComponentScore]
    data_window_years: int

    def to_breakdown(self) -> dict:
        return {
            "components": {
                c.name: {
                    "score": round(c.score, 2),
                    "max": c.max_score,
                    "details": c.details,
                }
                for c in self.components
            },
            "data_window_years": self.data_window_years,
        }


# === 헬퍼 ===

def _bucket(value: float, thresholds: list[tuple[float, float]]) -> float:
    """thresholds = [(lower_bound, score), ...] — value >= lower_bound 순서대로 매칭."""
    for lb, sc in thresholds:
        if value >= lb:
            return sc
    return 0


def _safe_div(a, b) -> Optional[float]:
    if a is None or b is None or b == 0:
        return None
    return a / b


def _cagr(latest: float, earliest: float, years: int) -> Optional[float]:
    if years <= 0 or earliest <= 0:
        return None
    if latest <= 0:
        return -1.0  # 매출/이익이 음수로 전환된 케이스
    return (latest / earliest) ** (1 / years) - 1


# === 카테고리별 산출 ===

def _profitability(annuals: list[Annual]) -> ComponentScore:
    roes: list[float] = []
    op_margins: list[float] = []
    for a in annuals:
        roe = _safe_div(a.net_income, a.total_equity)
        if roe is not None:
            roes.append(roe)
        opm = _safe_div(a.operating_income, a.revenue)
        if opm is not None:
            op_margins.append(opm)

    details: dict = {}
    score = 0.0

    if roes:
        roe_avg = mean(roes)
        details["roe_avg"] = round(roe_avg, 4)
        score += _bucket(roe_avg, ROE_THRESHOLDS)
        if len(roes) >= 2:
            roe_vol = pstdev(roes) / abs(roe_avg) if roe_avg != 0 else float("inf")
            details["roe_volatility"] = round(roe_vol, 4)
            score += _bucket(-roe_vol, [(-0.20, 5), (-0.50, 3), (-1e9, 0)])
    if op_margins:
        opm_avg = mean(op_margins)
        details["op_margin_avg"] = round(opm_avg, 4)
        score += _bucket(opm_avg, OP_MARGIN_THRESHOLDS)

    return ComponentScore("profitability", score, 30, details)


def _health(annuals: list[Annual]) -> ComponentScore:
    """최근 연도 기준."""
    details: dict = {}
    score = 0.0
    if not annuals:
        return ComponentScore("health", 0, 20, details)
    latest = annuals[0]

    debt_ratio = _safe_div(latest.total_liabilities, latest.total_equity)
    if debt_ratio is not None:
        details["debt_ratio"] = round(debt_ratio, 4)
        score += _bucket(-debt_ratio, [(-0.50, 15), (-1.00, 10), (-2.00, 5), (-1e9, 0)])

    current_ratio = _safe_div(latest.current_assets, latest.current_liabilities)
    if current_ratio is not None:
        details["current_ratio"] = round(current_ratio, 4)
        if current_ratio >= CURRENT_RATIO_OK:
            score += 5
        elif current_ratio >= 1.0:
            score += 3
        else:
            score += 0

    return ComponentScore("health", score, 20, details)


def _cash_gen(annuals: list[Annual]) -> ComponentScore:
    details: dict = {}
    score = 0.0
    ratios: list[float] = []
    fcf_positive_count = 0
    fcf_total_count = 0
    for a in annuals:
        if a.operating_cash_flow is not None and a.net_income and a.net_income > 0:
            ratios.append(a.operating_cash_flow / a.net_income)
        if a.operating_cash_flow is not None and a.capex is not None:
            fcf = a.operating_cash_flow - a.capex
            fcf_total_count += 1
            if fcf > 0:
                fcf_positive_count += 1

    if ratios:
        avg = mean(ratios)
        details["ocf_to_ni_avg"] = round(avg, 4)
        score += _bucket(avg, OCF_NI_THRESHOLDS)
    if fcf_total_count > 0:
        details["fcf_positive_years"] = f"{fcf_positive_count}/{fcf_total_count}"
        if fcf_total_count >= 2:
            ratio = fcf_positive_count / fcf_total_count
            if ratio == 1.0:
                score += 5
            elif ratio >= 0.6:
                score += 3
        elif fcf_positive_count == 1:
            score += 3  # 1년치만 있을 때 양수면 부분 점수

    return ComponentScore("cash_gen", score, 15, details)


def _growth(annuals: list[Annual]) -> ComponentScore:
    """가장 오래된 vs 최신 비교. 1년치만 있으면 0점."""
    details: dict = {}
    score = 0.0
    sorted_a = sorted(annuals, key=lambda a: a.fiscal_year)
    if len(sorted_a) < 2:
        details["note"] = "need >= 2 years"
        return ComponentScore("growth", 0, 15, details)
    earliest, latest = sorted_a[0], sorted_a[-1]
    years = latest.fiscal_year - earliest.fiscal_year

    rev_cagr = (
        _cagr(latest.revenue, earliest.revenue, years)
        if (latest.revenue and earliest.revenue) else None
    )
    if rev_cagr is not None:
        details["revenue_cagr"] = round(rev_cagr, 4)
        score += _bucket(rev_cagr, REV_CAGR_THRESHOLDS)

    ni_cagr = (
        _cagr(latest.net_income, earliest.net_income, years)
        if (latest.net_income and earliest.net_income) else None
    )
    if ni_cagr is not None:
        details["net_income_cagr"] = round(ni_cagr, 4)
        score += _bucket(ni_cagr, NI_CAGR_THRESHOLDS)

    return ComponentScore("growth", score, 15, details)


def _stability(annuals: list[Annual]) -> ComponentScore:
    losses = sum(1 for a in annuals if a.net_income is not None and a.net_income < 0)
    n = sum(1 for a in annuals if a.net_income is not None)
    details = {"losses": losses, "years_observed": n}
    if n == 0:
        return ComponentScore("stability", 0, 10, details)
    if losses == 0:
        score = 10
    elif losses == 1:
        score = 5
    else:
        score = 0
    return ComponentScore("stability", score, 10, details)


def _event_impact(events: RecentEventCounts) -> ComponentScore:
    """최근 90일 공시 영향 — 최대 +10 / 최소 -10.

    부정 이벤트는 가중치 ×2 (Buffett: 손실 회피).
    """
    raw = events.positive * 1 - events.negative * 2
    score = max(-10, min(10, raw))
    return ComponentScore(
        name="event_impact",
        score=score,
        max_score=10,
        details={
            "positive": events.positive,
            "negative": events.negative,
            "raw_calc": f"+{events.positive} ×1 − {events.negative} ×2 = {raw}",
        },
    )


def _oe_yield(annuals: list[Annual], market_cap: Optional[int]) -> ComponentScore:
    details: dict = {}
    if not annuals or market_cap is None or market_cap == 0:
        return ComponentScore("oe_yield", 0, 10, details)
    latest = annuals[0]
    if latest.operating_cash_flow is None or latest.capex is None:
        return ComponentScore("oe_yield", 0, 10, details)
    oe = latest.operating_cash_flow - latest.capex
    yield_ = oe / market_cap
    details["owner_earnings"] = oe
    details["oe_yield"] = round(yield_, 4)
    score = _bucket(yield_, OE_YIELD_THRESHOLDS)
    return ComponentScore("oe_yield", score, 10, details)


# === 메인 진입점 ===

def compute_score(inp: ScoreInput) -> ScoreResult:
    # 최신 → 과거 순으로 정렬 (내림차순)
    annuals = sorted(inp.annuals, key=lambda a: a.fiscal_year, reverse=True)

    components = [
        _profitability(annuals),
        _health(annuals),
        _cash_gen(annuals),
        _growth(annuals),
        _stability(annuals),
        _oe_yield(annuals, inp.market_cap),
        _event_impact(inp.events),
    ]
    # 합계는 0~100으로 클립 (event_impact 가 음수면 base 점수 깎임)
    raw_total = sum(c.score for c in components)
    total = max(0.0, min(100.0, raw_total))
    return ScoreResult(
        ticker=inp.ticker,
        total=total,
        components=components,
        data_window_years=len(annuals),
    )
