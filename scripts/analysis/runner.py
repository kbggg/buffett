"""Buffett Score + 내재가치 + 안전마진 일괄 계산 후 scores 테이블 적재.

CLI:
  uv run python -m analysis.runner               # 모든 종목, 오늘 기준
  uv run python -m analysis.runner --ticker 005930 --ticker 000660  # 특정 종목만
  uv run python -m analysis.runner --as-of 2025-12-31              # 백테스트용
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime
from typing import Iterable

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

import pandas as pd  # noqa: E402
from sqlalchemy import text  # noqa: E402

from sync.db import get_engine  # noqa: E402
from analysis.score import Annual, ScoreInput, compute_score, ScoreResult  # noqa: E402
from analysis.intrinsic import compute_intrinsic, IntrinsicResult  # noqa: E402
from analysis.timing import compute_timing, TimingResult  # noqa: E402


def _load_annuals(conn, ticker: str, as_of: date) -> list[Annual]:
    """report_date <= as_of 인 연간(A) 재무만 — look-ahead bias 방지."""
    rows = conn.execute(text(
        """
        select fiscal_year, report_date,
               revenue, operating_income, net_income,
               total_assets, total_equity, equity_attributable_to_owners, total_liabilities,
               current_assets, current_liabilities,
               operating_cash_flow, capex, eps
        from financials
        where ticker = :t and period_type = 'A'
          and report_date <= :as_of
        order by fiscal_year desc
        """
    ), {"t": ticker, "as_of": as_of}).all()
    return [
        Annual(
            fiscal_year=r.fiscal_year,
            report_date=r.report_date,
            revenue=int(r.revenue) if r.revenue is not None else None,
            operating_income=int(r.operating_income) if r.operating_income is not None else None,
            net_income=int(r.net_income) if r.net_income is not None else None,
            total_assets=int(r.total_assets) if r.total_assets is not None else None,
            total_equity=int(r.total_equity) if r.total_equity is not None else None,
            equity_attributable_to_owners=(
                int(r.equity_attributable_to_owners)
                if r.equity_attributable_to_owners is not None else None
            ),
            total_liabilities=int(r.total_liabilities) if r.total_liabilities is not None else None,
            current_assets=int(r.current_assets) if r.current_assets is not None else None,
            current_liabilities=int(r.current_liabilities) if r.current_liabilities is not None else None,
            operating_cash_flow=int(r.operating_cash_flow) if r.operating_cash_flow is not None else None,
            capex=int(r.capex) if r.capex is not None else None,
            eps=float(r.eps) if r.eps is not None else None,
        )
        for r in rows
    ]


def _load_market(
    conn, ticker: str, as_of: date
) -> tuple[int | None, int | None, float | None]:
    """(market_cap, shares_outstanding, latest close at as_of)."""
    mc = conn.execute(text(
        "select market_cap, shares_outstanding from stocks where ticker = :t"
    ), {"t": ticker}).first()
    market_cap = int(mc.market_cap) if mc and mc.market_cap is not None else None
    shares = int(mc.shares_outstanding) if mc and mc.shares_outstanding is not None else None
    price_row = conn.execute(text(
        "select close from prices where ticker = :t and date <= :d "
        "order by date desc limit 1"
    ), {"t": ticker, "d": as_of}).first()
    price = float(price_row.close) if price_row else None
    return market_cap, shares, price


def _load_prices(conn, ticker: str, as_of: date, days: int = 300) -> pd.DataFrame:
    """타이밍 신호 계산용. 최근 300거래일치 (52w + MA200 모두 커버)."""
    rows = conn.execute(text(
        "select date, close from prices where ticker = :t and date <= :d "
        "order by date desc limit :n"
    ), {"t": ticker, "d": as_of, "n": days}).all()
    if not rows:
        return pd.DataFrame(columns=["date", "close"])
    return pd.DataFrame([{"date": r.date, "close": float(r.close)} for r in rows])


_UPSERT_SQL = text(
    """
    insert into scores (
      ticker, calc_date, buffett_score,
      intrinsic_dcf, intrinsic_owner_earnings, intrinsic_graham, intrinsic_avg,
      margin_of_safety, timing_signal, breakdown
    ) values (
      :ticker, :calc_date, :buffett_score,
      :dcf, :oe, :graham, :avg,
      :mos, :timing, :breakdown
    )
    on conflict (ticker, calc_date) do update set
      buffett_score = excluded.buffett_score,
      intrinsic_dcf = excluded.intrinsic_dcf,
      intrinsic_owner_earnings = excluded.intrinsic_owner_earnings,
      intrinsic_graham = excluded.intrinsic_graham,
      intrinsic_avg = excluded.intrinsic_avg,
      margin_of_safety = excluded.margin_of_safety,
      timing_signal = excluded.timing_signal,
      breakdown = excluded.breakdown
    """
)


def _list_target_tickers(
    conn, only_tickers: list[str] | None, markets: list[str]
) -> list[str]:
    if only_tickers:
        return only_tickers
    placeholders = ",".join(f":m{i}" for i in range(len(markets)))
    params = {f"m{i}": m for i, m in enumerate(markets)}
    rows = conn.execute(text(
        f"select ticker from stocks "
        f"where not is_preferred and corp_code is not null "
        f"and market in ({placeholders}) "
        f"order by ticker"
    ), params).all()
    return [r.ticker for r in rows]


def run_one(
    conn, ticker: str, as_of: date
) -> tuple[ScoreResult, IntrinsicResult, TimingResult] | None:
    annuals = _load_annuals(conn, ticker, as_of)
    if not annuals:
        return None
    market_cap, shares, price = _load_market(conn, ticker, as_of)
    sr = compute_score(ScoreInput(ticker=ticker, annuals=annuals, market_cap=market_cap))
    ir = compute_intrinsic(annuals, shares, price)
    prices_df = _load_prices(conn, ticker, as_of)
    tr = compute_timing(prices_df, as_of)
    return sr, ir, tr


def upsert(
    conn, ticker: str, as_of: date,
    sr: ScoreResult, ir: IntrinsicResult, tr: TimingResult,
) -> None:
    breakdown = sr.to_breakdown()
    breakdown["intrinsic"] = {
        "details": ir.details,
        "average": ir.average,
        "margin_of_safety_raw": ir.margin_of_safety,
    }
    breakdown["timing"] = {
        "signal": tr.signal,
        "pos_52w": tr.pos_52w,
        "rsi_14": tr.rsi_14,
        "ma_200": tr.ma_200,
        "current_price": tr.current_price,
        "above_ma200": tr.above_ma200,
        "pos_ok": tr.pos_ok,
        "rsi_ok": tr.rsi_ok,
    }
    # numeric(5,2) 한계 ±9.99 (=±999%) — 소형주 intrinsic≈0 noise 캡.
    mos = ir.margin_of_safety
    if mos is not None:
        mos = max(-9.99, min(9.99, mos))
    conn.execute(_UPSERT_SQL, {
        "ticker": ticker,
        "calc_date": as_of,
        "buffett_score": sr.total,
        "dcf": ir.dcf,
        "oe": ir.owner_earnings,
        "graham": ir.graham,
        "avg": ir.average,
        "mos": mos,
        "timing": tr.signal,
        "breakdown": json.dumps(breakdown, default=str, ensure_ascii=False),
    })


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--ticker", action="append", help="specific ticker(s); default = all in markets")
    p.add_argument(
        "--markets", default="KOSPI",
        help="comma-separated markets (default: KOSPI; e.g. 'KOSPI,KOSDAQ')",
    )
    p.add_argument("--as-of", type=str, default=None, help="ISO date; default = today")
    args = p.parse_args()

    as_of = (
        datetime.strptime(args.as_of, "%Y-%m-%d").date() if args.as_of else date.today()
    )
    markets = [m.strip().upper() for m in args.markets.split(",") if m.strip()]
    print(f"[scores] as_of = {as_of} | markets = {markets}")

    engine = get_engine()
    with engine.connect() as conn:
        targets = _list_target_tickers(conn, args.ticker, markets)
    print(f"[scores] targets = {len(targets)}")

    ok = 0
    skipped = 0
    fails: list[tuple[str, str]] = []
    # 청크 단위로 outer transaction + SAVEPOINT per ticker. 한 종목 실패가
    # 같은 청크 다른 종목에 영향 없음 (InFailedSqlTransaction 도미노 방지).
    CHUNK = 100
    for chunk_start in range(0, len(targets), CHUNK):
        chunk = targets[chunk_start : chunk_start + CHUNK]
        with engine.begin() as conn:
            for ticker in chunk:
                try:
                    with conn.begin_nested():  # SAVEPOINT
                        result = run_one(conn, ticker, as_of)
                        if result is None:
                            skipped += 1
                            continue
                        sr, ir, tr = result
                        upsert(conn, ticker, as_of, sr, ir, tr)
                        ok += 1
                except Exception as e:
                    fails.append((ticker, repr(e)[:120]))
                    print(f"  ! {ticker}: {repr(e)[:120]}", file=sys.stderr)
        print(f"  [{chunk_start + len(chunk):>4}/{len(targets)}] last={chunk[-1]} | ok={ok} skip={skipped} fail={len(fails)}")

    print(f"\n[scores] done: ok={ok}, skipped={skipped}, failed={len(fails)}")
    if fails:
        print("[scores] first 5 failures:")
        for t, msg in fails[:5]:
            print(f"  - {t}: {msg}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
