"""진입 타이밍 신호 — 가치 검증된 종목의 매수 시점 필터링.

3개 지표 종합:
- 52주 위치: 60~85% 구간 안전 (천장 매수 회피, 바닥 잡기 회피)
- RSI(14): 40~60 평이 (과열/침체 회피)
- 현재가 > 200일 이평선: 중장기 추세 확인

신호 합성:
- 3개 모두 OK → BUY
- 2개 OK         → WATCH
- 1개 이하       → NEUTRAL

CLAUDE.md 원칙: 차트 매수+매도 신호 X. 이건 "가치 검증된 매수후보의 진입 시점 필터" 만.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional

import pandas as pd


# 임계값 (보수적)
POS_52W_LOW = 0.60
POS_52W_HIGH = 0.85
RSI_LOW = 40
RSI_HIGH = 60
RSI_PERIOD = 14
WINDOW_DAYS = 252  # 52주 = 약 252 거래일
MA_PERIOD = 200


@dataclass
class TimingResult:
    signal: Optional[str]  # 'BUY' | 'WATCH' | 'NEUTRAL' | None
    pos_52w: Optional[float]  # 0..1
    rsi_14: Optional[float]
    ma_200: Optional[float]
    current_price: Optional[float]
    above_ma200: Optional[bool]
    pos_ok: Optional[bool]
    rsi_ok: Optional[bool]


def compute_timing(prices: pd.DataFrame, as_of: date) -> TimingResult:
    """prices: ['date', 'close']. 호출자가 ticker 단위로 슬라이스해서 넘김.

    as_of 까지의 데이터만 사용. 데이터가 너무 적으면 None 신호.
    """
    if prices is None or prices.empty:
        return TimingResult(None, None, None, None, None, None, None, None)

    df = prices[prices["date"] <= as_of].sort_values("date")
    if len(df) < 30:  # 너무 짧으면 신호 의미 없음
        return TimingResult(None, None, None, None, None, None, None, None)

    closes = df["close"].astype(float).reset_index(drop=True)
    current = float(closes.iloc[-1])

    # 52주 위치
    recent = closes.tail(WINDOW_DAYS)
    high_52w = float(recent.max())
    low_52w = float(recent.min())
    pos_52w = (
        (current - low_52w) / (high_52w - low_52w)
        if high_52w > low_52w else None
    )

    # MA200
    ma200 = float(closes.tail(MA_PERIOD).mean()) if len(closes) >= MA_PERIOD else None
    above_ma200 = (current > ma200) if ma200 is not None else None

    # RSI(14) — Wilder smoothing
    rsi = None
    if len(closes) > RSI_PERIOD:
        delta = closes.diff()
        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)
        avg_gain = gain.ewm(alpha=1/RSI_PERIOD, adjust=False, min_periods=RSI_PERIOD).mean()
        avg_loss = loss.ewm(alpha=1/RSI_PERIOD, adjust=False, min_periods=RSI_PERIOD).mean()
        rs = avg_gain / avg_loss.replace(0, pd.NA)
        rsi_series = 100 - (100 / (1 + rs))
        rsi_val = rsi_series.iloc[-1]
        rsi = float(rsi_val) if pd.notna(rsi_val) else None

    pos_ok = (
        POS_52W_LOW <= pos_52w <= POS_52W_HIGH
        if pos_52w is not None else None
    )
    rsi_ok = RSI_LOW <= rsi <= RSI_HIGH if rsi is not None else None

    # 신호 합성 — 모르는 항목은 점수 안 더함 (보수적)
    n_ok = sum(1 for v in (pos_ok, rsi_ok, above_ma200) if v is True)
    n_evaluated = sum(1 for v in (pos_ok, rsi_ok, above_ma200) if v is not None)

    if n_evaluated < 2:
        signal = None
    elif n_ok == n_evaluated and n_evaluated == 3:
        signal = "BUY"
    elif n_ok >= 2:
        signal = "WATCH"
    else:
        signal = "NEUTRAL"

    return TimingResult(
        signal=signal,
        pos_52w=round(pos_52w, 4) if pos_52w is not None else None,
        rsi_14=round(rsi, 2) if rsi is not None else None,
        ma_200=round(ma200, 2) if ma200 is not None else None,
        current_price=round(current, 2),
        above_ma200=above_ma200,
        pos_ok=pos_ok,
        rsi_ok=rsi_ok,
    )
