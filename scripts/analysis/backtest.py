"""백테스트 엔진 — '시스템 따랐다면 결과는?'.

CLAUDE.md 길 C 핵심 차별점.

규칙:
- 매 rebalance(월말)마다 그 시점에 가용한 financials 로 점수 재산출 (look-ahead 방지).
- 가치통과 (Buffett Score >= 80 + 안전마진 >= 30%) 종목 중 상위 N 선정.
- 동등 가중 (each = capital × 1/N).
- 다음 rebalance까지 보유. 빠진 종목 매도 + 새 종목 매수.
- 거래비용 0.4% (매수+매도 각각).
- 일별 NAV 평가, 누적 수익률 vs KOSPI 비교.

데이터 한계: 현재 financials Y2024+Y2025만 → 2025-04 ~ 현재 (1년) 만 가능.
5년치 backfill 후 진정한 5년 백테스트 가능.
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from datetime import date, timedelta

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

import pandas as pd  # noqa: E402
from sqlalchemy import text  # noqa: E402

from sync.db import get_engine  # noqa: E402
from analysis.score import ScoreInput, compute_score, Annual  # noqa: E402
from analysis.intrinsic import compute_intrinsic  # noqa: E402


@dataclass
class BacktestParams:
    start_date: date
    end_date: date
    initial_capital: int = 100_000_000  # 1억원
    rebalance_frequency: str = "monthly"  # 'monthly' | 'quarterly'
    max_positions: int = 10
    min_score: float = 80.0
    min_mos: float = 0.30
    tx_cost: float = 0.004  # 0.4%
    market: str = "KOSPI"


@dataclass
class Trade:
    date: date
    ticker: str
    action: str  # 'BUY' | 'SELL'
    qty: int
    price: float
    cost: float  # 거래비용 절대금액


@dataclass
class Snapshot:
    date: date
    nav: float  # 포트폴리오 총가치 (현금 + 보유)
    cash: float
    holdings: dict[str, int]  # ticker → qty


@dataclass
class BacktestResult:
    params: BacktestParams
    history: list[Snapshot] = field(default_factory=list)
    trades: list[Trade] = field(default_factory=list)
    final_value: float = 0
    total_return: float = 0  # fraction
    kospi_return: float = 0
    outperformance: float = 0


# === 캐시: 백테스트 시작 시 모든 데이터 한 번에 로드 ===

@dataclass
class BacktestCache:
    """In-memory cache to avoid per-ticker DB roundtrips."""
    annuals_by_ticker: dict[str, list[Annual]]  # 모든 연간 (정렬: fiscal_year desc)
    shares_by_ticker: dict[str, int | None]
    prices_by_ticker: dict[str, pd.DataFrame]  # 인덱스: date, 컬럼: close
    kospi_prices: pd.DataFrame  # 인덱스: date, 컬럼: close
    kospi_tickers: list[str]


def _load_cache(conn, params: BacktestParams) -> BacktestCache:
    print("  loading cache...")
    # 모든 financials (KOSPI universe)
    fin_rows = conn.execute(text("""
        select f.ticker, f.fiscal_year, f.report_date,
               f.revenue, f.operating_income, f.net_income,
               f.total_assets, f.total_equity, f.equity_attributable_to_owners,
               f.total_liabilities, f.current_assets, f.current_liabilities,
               f.operating_cash_flow, f.capex, f.eps
        from financials f join stocks s on s.ticker = f.ticker
        where s.market = :m and not s.is_preferred and s.corp_code is not null
          and f.period_type = 'A'
        order by f.ticker, f.fiscal_year desc
    """), {"m": params.market}).all()
    annuals_by: dict[str, list[Annual]] = {}
    for r in fin_rows:
        a = Annual(
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
        annuals_by.setdefault(r.ticker, []).append(a)
    print(f"    annuals: {sum(len(v) for v in annuals_by.values()):,} rows / {len(annuals_by)} tickers")

    # shares_outstanding (현재값만 사용, 시점별 변동 무시 — 근사)
    sh_rows = conn.execute(text(
        "select ticker, shares_outstanding from stocks where market = :m"
    ), {"m": params.market}).all()
    shares_by = {
        r.ticker: int(r.shares_outstanding) if r.shares_outstanding is not None else None
        for r in sh_rows
    }

    # 가격 — KOSPI 대상 + KS11
    universe = list(annuals_by.keys()) + ["KS11"]
    px_rows = conn.execute(text("""
        select ticker, date, close from prices
        where ticker = ANY(:t) and date >= :start and date <= :end
        order by ticker, date
    """), {"t": universe, "start": params.start_date - timedelta(days=30), "end": params.end_date}).all()
    prices_by: dict[str, pd.DataFrame] = {}
    cur_t = None
    cur_records: list[dict] = []
    for r in px_rows:
        if cur_t is None:
            cur_t = r.ticker
        if r.ticker != cur_t:
            prices_by[cur_t] = pd.DataFrame(cur_records).set_index("date")
            cur_t = r.ticker
            cur_records = []
        cur_records.append({"date": r.date, "close": float(r.close)})
    if cur_records and cur_t is not None:
        prices_by[cur_t] = pd.DataFrame(cur_records).set_index("date")
    print(f"    prices: {sum(len(v) for v in prices_by.values()):,} rows / {len(prices_by)} tickers")

    return BacktestCache(
        annuals_by_ticker=annuals_by,
        shares_by_ticker=shares_by,
        prices_by_ticker=prices_by,
        kospi_prices=prices_by.get("KS11", pd.DataFrame()),
        kospi_tickers=list(annuals_by.keys()),
    )


def _annuals_at(cache: BacktestCache, ticker: str, as_of: date) -> list[Annual]:
    """캐시에서 report_date <= as_of 인 annuals만 반환."""
    return [a for a in cache.annuals_by_ticker.get(ticker, []) if a.report_date <= as_of]


def _price_at_cache(cache: BacktestCache, ticker: str, as_of: date) -> float | None:
    df = cache.prices_by_ticker.get(ticker)
    if df is None or df.empty:
        return None
    sub = df[df.index <= as_of]
    if sub.empty:
        return None
    return float(sub.iloc[-1]["close"])


# === 종목 선정 ===

def _select_top(cache: BacktestCache, as_of: date, params: BacktestParams) -> list[tuple[str, float]]:
    """as_of 시점에서 점수 산출 후 가치통과 종목 정렬. 캐시 기반."""
    candidates: list[tuple[str, float, float]] = []
    for ticker in cache.kospi_tickers:
        annuals = _annuals_at(cache, ticker, as_of)
        if not annuals:
            continue
        shares = cache.shares_by_ticker.get(ticker)
        price = _price_at_cache(cache, ticker, as_of)
        market_cap = int(price * shares) if (price and shares) else None
        sr = compute_score(ScoreInput(ticker=ticker, annuals=annuals, market_cap=market_cap))
        if sr.total < params.min_score:
            continue
        ir = compute_intrinsic(annuals, shares, price)
        if ir.margin_of_safety is None or ir.margin_of_safety < params.min_mos:
            continue
        candidates.append((ticker, sr.total, ir.margin_of_safety))
    candidates.sort(key=lambda x: (x[1], x[2]), reverse=True)
    return [(c[0], c[1]) for c in candidates[: params.max_positions]]


# === Portfolio ===

class Portfolio:
    def __init__(self, capital: float):
        self.cash: float = capital
        self.holdings: dict[str, int] = {}

    def value_at(self, cache: BacktestCache, as_of: date) -> float:
        total = self.cash
        for ticker, qty in self.holdings.items():
            p = _price_at_cache(cache, ticker, as_of)
            if p is not None:
                total += p * qty
        return total

    def rebalance(
        self,
        cache: BacktestCache,
        as_of: date,
        targets: list[str],
        params: BacktestParams,
    ) -> list[Trade]:
        trades: list[Trade] = []
        for ticker in list(self.holdings.keys()):
            if ticker in targets:
                continue
            qty = self.holdings.pop(ticker)
            price = _price_at_cache(cache, ticker, as_of)
            if price is None:
                continue
            gross = qty * price
            cost = gross * params.tx_cost
            self.cash += gross - cost
            trades.append(Trade(date=as_of, ticker=ticker, action="SELL", qty=qty, price=price, cost=cost))

        if not targets:
            return trades
        nav = self.value_at(cache, as_of)
        per_position = nav / len(targets)
        for ticker in targets:
            price = _price_at_cache(cache, ticker, as_of)
            if price is None:
                continue
            current_value = self.holdings.get(ticker, 0) * price
            need = per_position - current_value
            if need <= 0:
                continue
            buyable = need / (1 + params.tx_cost)
            qty = int(buyable / price)
            if qty <= 0:
                continue
            gross = qty * price
            cost = gross * params.tx_cost
            total = gross + cost
            if total > self.cash:
                qty = int((self.cash / (1 + params.tx_cost)) / price)
                if qty <= 0:
                    continue
                gross = qty * price
                cost = gross * params.tx_cost
                total = gross + cost
            self.cash -= total
            self.holdings[ticker] = self.holdings.get(ticker, 0) + qty
            trades.append(Trade(date=as_of, ticker=ticker, action="BUY", qty=qty, price=price, cost=cost))
        return trades


# === 메인 엔진 ===

def _gen_rebalance_dates(start: date, end: date, freq: str) -> list[date]:
    """월말 또는 분기말. 단순화: 매월 마지막 영업일."""
    out: list[date] = []
    cur = date(start.year, start.month, 1)
    if freq == "monthly":
        delta_months = 1
    elif freq == "quarterly":
        delta_months = 3
    else:
        raise ValueError(f"unknown freq {freq}")
    while cur <= end:
        # 다음 달 1일 - 1일 = 월말
        if cur.month + delta_months > 12:
            next_mo_year = cur.year + (cur.month + delta_months - 1) // 12
            next_mo_month = (cur.month + delta_months - 1) % 12 + 1
        else:
            next_mo_year = cur.year
            next_mo_month = cur.month + delta_months
        last = date(next_mo_year, next_mo_month, 1) - timedelta(days=1)
        if last >= start and last <= end:
            out.append(last)
        cur = date(next_mo_year, next_mo_month, 1)
    return out


def _kospi_return_cache(cache: BacktestCache, start: date, end: date) -> float:
    df = cache.kospi_prices
    if df.empty:
        return 0
    s = df[df.index >= start]
    e = df[df.index <= end]
    if s.empty or e.empty:
        return 0
    return float(e.iloc[-1]["close"]) / float(s.iloc[0]["close"]) - 1


def run_backtest(params: BacktestParams) -> BacktestResult:
    engine = get_engine()
    result = BacktestResult(params=params)
    portfolio = Portfolio(capital=params.initial_capital)
    rebalance_dates = _gen_rebalance_dates(params.start_date, params.end_date, params.rebalance_frequency)

    print(f"[backtest] {params.start_date} → {params.end_date}", flush=True)
    print(f"  rebalance: {params.rebalance_frequency} ({len(rebalance_dates)} times)", flush=True)
    print(f"  initial: {params.initial_capital:,}", flush=True)

    with engine.connect() as conn:
        cache = _load_cache(conn, params)

    # Rebalance 사이클 (캐시 기반, DB 접속 없음)
    for i, rd in enumerate(rebalance_dates, 1):
        top = _select_top(cache, rd, params)
        target_tickers = [t[0] for t in top]
        new_trades = portfolio.rebalance(cache, rd, target_tickers, params)
        result.trades.extend(new_trades)
        nav = portfolio.value_at(cache, rd)
        result.history.append(Snapshot(date=rd, nav=nav, cash=portfolio.cash, holdings=dict(portfolio.holdings)))
        print(
            f"  [{i:>2}/{len(rebalance_dates)}] {rd} | NAV {nav:>15,.0f} | cash {portfolio.cash:>13,.0f} | "
            f"holdings {len(portfolio.holdings)} | trades {len(new_trades)}",
            flush=True,
        )

    final_value = portfolio.value_at(cache, params.end_date)
    result.final_value = final_value
    result.total_return = (final_value / params.initial_capital) - 1
    result.kospi_return = _kospi_return_cache(cache, params.start_date, params.end_date)
    result.outperformance = result.total_return - result.kospi_return

    print("\n[backtest] DONE", flush=True)
    print(f"  Final NAV: {result.final_value:,.0f}", flush=True)
    print(f"  Total return: {result.total_return * 100:+.2f}%", flush=True)
    print(f"  KOSPI return: {result.kospi_return * 100:+.2f}%", flush=True)
    print(f"  Outperformance: {result.outperformance * 100:+.2f}%p", flush=True)
    print(f"  Total trades: {len(result.trades)}", flush=True)
    return result


# === 저장 ===

def save_result(result: BacktestResult, notes: str | None = None) -> int:
    engine = get_engine()
    p = result.params
    history_json = json.dumps([
        {
            "date": s.date.isoformat(),
            "nav": s.nav,
            "cash": s.cash,
            "holdings": s.holdings,
        }
        for s in result.history
    ], default=str, ensure_ascii=False)
    trades_json = json.dumps([
        {
            "date": t.date.isoformat(),
            "ticker": t.ticker,
            "action": t.action,
            "qty": t.qty,
            "price": t.price,
            "cost": t.cost,
        }
        for t in result.trades
    ], default=str, ensure_ascii=False)
    with engine.begin() as conn:
        row = conn.execute(text("""
            insert into backtest_runs (
              start_date, end_date, initial_capital, rebalance_frequency,
              max_positions, min_score, min_mos, tx_cost,
              final_value, total_return, kospi_return, outperformance,
              rebalance_count, total_trades,
              portfolio_history, trades, notes
            ) values (
              :start_date, :end_date, :initial_capital, :rebalance_frequency,
              :max_positions, :min_score, :min_mos, :tx_cost,
              :final_value, :total_return, :kospi_return, :outperformance,
              :rebalance_count, :total_trades,
              cast(:portfolio_history as jsonb), cast(:trades as jsonb), :notes
            )
            returning id
        """), {
            "start_date": p.start_date,
            "end_date": p.end_date,
            "initial_capital": p.initial_capital,
            "rebalance_frequency": p.rebalance_frequency,
            "max_positions": p.max_positions,
            "min_score": p.min_score,
            "min_mos": p.min_mos,
            "tx_cost": p.tx_cost,
            "final_value": result.final_value,
            "total_return": result.total_return,
            "kospi_return": result.kospi_return,
            "outperformance": result.outperformance,
            "rebalance_count": len(result.history),
            "total_trades": len(result.trades),
            "portfolio_history": history_json,
            "trades": trades_json,
            "notes": notes,
        }).first()
    return row.id if row else 0


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--start", type=str, default="2025-04-01")
    p.add_argument("--end", type=str, default=None)
    p.add_argument("--capital", type=int, default=100_000_000)
    p.add_argument("--freq", choices=["monthly", "quarterly"], default="monthly")
    p.add_argument("--positions", type=int, default=10)
    p.add_argument("--min-score", type=float, default=80.0)
    p.add_argument("--min-mos", type=float, default=0.30)
    p.add_argument("--save", action="store_true", help="save to backtest_runs table")
    args = p.parse_args()

    end_date = (
        date.fromisoformat(args.end) if args.end else date.today() - timedelta(days=1)
    )
    params = BacktestParams(
        start_date=date.fromisoformat(args.start),
        end_date=end_date,
        initial_capital=args.capital,
        rebalance_frequency=args.freq,
        max_positions=args.positions,
        min_score=args.min_score,
        min_mos=args.min_mos,
    )
    result = run_backtest(params)
    if args.save:
        rid = save_result(result, notes=f"CLI run {date.today()}")
        print(f"\nsaved as backtest_runs.id = {rid}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
