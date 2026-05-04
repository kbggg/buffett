"""KOSPI 인덱스 일별 가격 — 백테스트 벤치마크용.

FDR.DataReader('KS11', start, end) 로 KOSPI 종합지수 가져옴.
prices 테이블에 ticker='KS11' 로 저장 (가상 종목).
"""
from __future__ import annotations

import sys
from datetime import date, timedelta

sys.stdout.reconfigure(encoding="utf-8")

import FinanceDataReader as fdr  # noqa: E402
import pandas as pd  # noqa: E402
from sqlalchemy import text  # noqa: E402

from sync.db import get_engine  # noqa: E402

KOSPI_TICKER = "KS11"


def main() -> int:
    end = date.today()
    start = end - timedelta(days=365 * 6)  # 6년치
    print(f"[kospi_index] {start} → {end}")

    df = fdr.DataReader(KOSPI_TICKER, start.isoformat(), end.isoformat())
    if df is None or df.empty:
        print("FDR returned empty"); return 1
    print(f"  fetched {len(df)} days")

    engine = get_engine()
    # stocks 테이블에 KS11 가상 종목 등록 (FK 위해)
    with engine.begin() as conn:
        conn.execute(text("""
            insert into stocks (ticker, name, market, is_preferred)
            values ('KS11', 'KOSPI 종합지수', 'KOSPI', false)
            on conflict (ticker) do nothing
        """))

    # prices 적재
    rows = []
    for idx, r in df.iterrows():
        d = idx.date() if hasattr(idx, "date") else idx
        close = r.get("Close")
        if pd.isna(close):
            continue
        rows.append({
            "ticker": KOSPI_TICKER,
            "date": d,
            "open": float(r.get("Open")) if not pd.isna(r.get("Open")) else None,
            "high": float(r.get("High")) if not pd.isna(r.get("High")) else None,
            "low": float(r.get("Low")) if not pd.isna(r.get("Low")) else None,
            "close": float(close),
            "volume": int(r.get("Volume")) if not pd.isna(r.get("Volume")) else None,
            "adj_close": float(close),
        })

    UPSERT = text("""
        insert into prices (ticker, date, open, high, low, close, volume, adj_close)
        values (:ticker, :date, :open, :high, :low, :close, :volume, :adj_close)
        on conflict (ticker, date) do update set
          close = excluded.close, volume = excluded.volume
    """)
    with engine.begin() as conn:
        conn.execute(UPSERT, rows)
    print(f"  upserted {len(rows)} rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
