"""일별 OHLCV 가격 수집.

소스: FinanceDataReader.DataReader(ticker, start, end).
대상 컬럼: open/high/low/close/volume/adj_close.
FDR가 반환하는 컬럼은 통상 ['Open','High','Low','Close','Volume','Change'] (no Adj Close).
한국 주식은 일반적으로 액면분할 / 무상증자 등을 반영한 수정주가가 'Close'로 들어옴(KRX 데이터 자체).
별도 'Adj Close'가 없는 경우 close == adj_close로 저장.

CLAUDE.md 원칙:
- "look-ahead bias 방지" → report_date(재무) 와 별개로 가격은 거래일 기준 그대로.
- "테스트는 작은 단위부터" → 기본 3종목, --all 로 전체.
- 우선주(is_preferred=true) 종목은 분석에 사용 안 하므로 --all 에서 제외 가능 (--include-preferred 로 강제).
"""

from __future__ import annotations

import argparse
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Iterable

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

import FinanceDataReader as fdr  # noqa: E402
import pandas as pd  # noqa: E402
from sqlalchemy import text  # noqa: E402

from sync.db import get_engine  # noqa: E402

DEFAULT_YEARS_BACK = 5
TEST_TICKERS = ("005930", "000660", "035720")


@dataclass(frozen=True)
class PriceRow:
    ticker: str
    date: date
    open: float | None
    high: float | None
    low: float | None
    close: float
    volume: int | None
    adj_close: float | None


def _fetch_one(ticker: str, start: date, end: date) -> list[PriceRow]:
    df: pd.DataFrame = fdr.DataReader(ticker, start.isoformat(), end.isoformat())
    if df is None or df.empty:
        return []
    rows: list[PriceRow] = []
    for idx, r in df.iterrows():
        # idx is a Timestamp
        d = idx.date() if hasattr(idx, "date") else idx
        close = r.get("Close")
        if pd.isna(close):
            continue
        rows.append(
            PriceRow(
                ticker=ticker,
                date=d,
                open=_f(r.get("Open")),
                high=_f(r.get("High")),
                low=_f(r.get("Low")),
                close=float(close),
                volume=_i(r.get("Volume")),
                # FDR는 별도 Adj Close 컬럼이 없음 — KRX 원본이 이미 수정주가.
                adj_close=float(close),
            )
        )
    return rows


def _f(v) -> float | None:
    if v is None or pd.isna(v):
        return None
    return float(v)


def _i(v) -> int | None:
    if v is None or pd.isna(v):
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


_UPSERT_SQL = text(
    """
    insert into prices (ticker, date, open, high, low, close, volume, adj_close)
    values (:ticker, :date, :open, :high, :low, :close, :volume, :adj_close)
    on conflict (ticker, date) do update set
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      volume = excluded.volume,
      adj_close = excluded.adj_close
    """
)


_BATCH = 500


def upsert(rows: Iterable[PriceRow]) -> int:
    """SQLAlchemy executemany 배치로 upsert. 단건 INSERT 대비 10~50배 빠름."""
    engine = get_engine()
    rows_list = list(rows)
    n = 0
    with engine.begin() as conn:
        for i in range(0, len(rows_list), _BATCH):
            chunk = rows_list[i : i + _BATCH]
            conn.execute(
                _UPSERT_SQL,
                [
                    {
                        "ticker": r.ticker,
                        "date": r.date,
                        "open": r.open,
                        "high": r.high,
                        "low": r.low,
                        "close": r.close,
                        "volume": r.volume,
                        "adj_close": r.adj_close,
                    }
                    for r in chunk
                ],
            )
            n += len(chunk)
    return n


def _list_target_tickers(include_preferred: bool, markets: list[str] | None = None) -> list[str]:
    engine = get_engine()
    where = []
    params: dict = {}
    if not include_preferred:
        where.append("not is_preferred")
    if markets:
        placeholders = ",".join(f":m{i}" for i in range(len(markets)))
        where.append(f"market in ({placeholders})")
        params.update({f"m{i}": m for i, m in enumerate(markets)})
    sql = "select ticker from stocks"
    if where:
        sql += " where " + " and ".join(where)
    sql += " order by ticker"
    with engine.connect() as conn:
        return [r.ticker for r in conn.execute(text(sql), params).all()]


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync daily OHLCV prices via FDR")
    parser.add_argument("--all", action="store_true", help="Sync all stocks (default: 3 test tickers)")
    parser.add_argument(
        "--include-preferred",
        action="store_true",
        help="Include preferred stocks when --all (default: excluded)",
    )
    parser.add_argument(
        "--years",
        type=int,
        default=DEFAULT_YEARS_BACK,
        help=f"Years back from today (default: {DEFAULT_YEARS_BACK})",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.0,
        help="Seconds to sleep between tickers when --all (default: 0)",
    )
    parser.add_argument(
        "--markets",
        default=None,
        help="comma-separated markets to filter (e.g. 'KOSPI'). default: all markets",
    )
    args = parser.parse_args()
    markets = (
        [m.strip().upper() for m in args.markets.split(",") if m.strip()]
        if args.markets else None
    )

    end = date.today()
    start = end - timedelta(days=args.years * 366)

    if args.all:
        tickers = _list_target_tickers(
            include_preferred=args.include_preferred, markets=markets,
        )
        mlabel = f"/{','.join(markets)}" if markets else ""
        print(f"[prices] mode = ALL ({len(tickers)} tickers{mlabel}, {args.years}y back)")
    else:
        tickers = list(TEST_TICKERS)
        print(f"[prices] mode = TEST ({len(tickers)} tickers, {args.years}y back)")
    print(f"[prices] window: {start} → {end}")

    total_rows = 0
    fails: list[tuple[str, str]] = []
    t0 = time.time()
    for i, ticker in enumerate(tickers, 1):
        try:
            rows = _fetch_one(ticker, start, end)
            n = upsert(rows)
            total_rows += n
            if not args.all or (i % 50 == 0) or i == len(tickers):
                elapsed = time.time() - t0
                rate = i / elapsed if elapsed > 0 else 0
                eta = (len(tickers) - i) / rate if rate > 0 else 0
                print(
                    f"  [{i:>4}/{len(tickers)}] {ticker}: {n} rows | "
                    f"total={total_rows} | {elapsed:.0f}s elapsed, ~{eta:.0f}s ETA"
                )
        except Exception as e:
            fails.append((ticker, repr(e)[:120]))
            print(f"  ! {ticker}: {repr(e)[:120]}", file=sys.stderr)
        if args.sleep > 0:
            time.sleep(args.sleep)

    print(f"\n[prices] done: {total_rows} rows in {time.time() - t0:.0f}s")
    if fails:
        print(f"[prices] failures: {len(fails)}")
        for t, msg in fails[:10]:
            print(f"  - {t}: {msg}")
    return 0 if not fails or args.all else 1


if __name__ == "__main__":
    sys.exit(main())
