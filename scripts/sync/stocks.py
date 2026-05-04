"""종목 마스터 수집.

소스: FinanceDataReader.StockListing("KOSPI" | "KOSDAQ").
pykrx는 2025~ 이후 KRX 엔드포인트 변경으로 list 조회가 깨져있어 보조용으로만 사용.
corp_code 매핑(OpenDART)은 corp_codes.py 에서 후속 처리.

CLAUDE.md 원칙: "테스트는 작은 단위부터." 기본은 2~3개 테스트 티커, --all 플래그로 전체.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from typing import Iterable

# Windows 콘솔 기본 인코딩(cp949)으로는 일부 유니코드(•, ✓ 등)가 깨진다.
# UTF-8 강제로 한글 종목명/특수문자 모두 안전하게 출력.
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

import FinanceDataReader as fdr  # noqa: E402
from sqlalchemy import text  # noqa: E402

from sync.db import get_engine  # noqa: E402

# CLAUDE.md "단계별 로드맵" 검증용 고정 종목.
# 삼성전자, SK하이닉스, 카카오 — 모두 KOSPI 코어 종목.
TEST_TICKERS: list[tuple[str, str]] = [
    ("005930", "KOSPI"),
    ("000660", "KOSPI"),
    ("035720", "KOSPI"),
]


@dataclass(frozen=True)
class StockRow:
    ticker: str
    name: str
    market: str  # "KOSPI" | "KOSDAQ"
    is_preferred: bool
    shares_outstanding: int | None
    market_cap: int | None


def _is_preferred_name(name: str) -> bool:
    # 우선주 표기는 보통 이름 끝에 '우' 또는 '우B'/'우C'.
    # 보수적으로: 마지막 글자가 '우'이고 길이가 본주 + 1글자이상이면 우선주로 간주.
    if not name:
        return False
    return name.endswith("우") or name.endswith("우B") or name.endswith("우C")


def _to_int(v) -> int | None:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f:  # NaN
        return None
    return int(f)


def _fetch_listing(market: str) -> list[StockRow]:
    """FDR로 한 시장의 전체 종목 리스트를 받아 StockRow 변환.

    FDR StockListing 컬럼 활용:
    - Code: 티커
    - Name: 종목명
    - Stocks: 발행주식수
    - Marcap: 시가총액 (원 단위)
    """
    df = fdr.StockListing(market)
    rows: list[StockRow] = []
    for _, row in df.iterrows():
        code = str(row.get("Code") or "").strip()
        name = str(row.get("Name") or "").strip()
        if not code or not name:
            continue
        ticker = code.zfill(6)
        rows.append(
            StockRow(
                ticker=ticker,
                name=name,
                market=market,
                is_preferred=_is_preferred_name(name),
                shares_outstanding=_to_int(row.get("Stocks")),
                market_cap=_to_int(row.get("Marcap")),
            )
        )
    return rows


def fetch_test_stocks() -> list[StockRow]:
    rows: list[StockRow] = []
    test_set = {t for t, _ in TEST_TICKERS}
    # 전체에서 필터하면 되지만, 테스트 모드는 FDR 호출 1회로 줄이기 위해 KOSPI만 받음.
    for sr in _fetch_listing("KOSPI"):
        if sr.ticker in test_set:
            rows.append(sr)
            print(f"  • {sr.ticker} {sr.name} ({sr.market})")
    return rows


def fetch_all_stocks() -> list[StockRow]:
    rows: list[StockRow] = []
    for market in ("KOSPI", "KOSDAQ"):
        market_rows = _fetch_listing(market)
        print(f"  {market}: {len(market_rows)} tickers")
        rows.extend(market_rows)
    return rows


_UPSERT_SQL = text(
    """
    insert into stocks (ticker, name, market, is_preferred,
                        shares_outstanding, market_cap, updated_at)
    values (:ticker, :name, :market, :is_preferred,
            :shares_outstanding, :market_cap, now())
    on conflict (ticker) do update set
      name = excluded.name,
      market = excluded.market,
      is_preferred = excluded.is_preferred,
      shares_outstanding = excluded.shares_outstanding,
      market_cap = excluded.market_cap,
      updated_at = now()
    """
)


def upsert(rows: Iterable[StockRow]) -> int:
    engine = get_engine()
    rows_list = list(rows)
    if not rows_list:
        return 0
    payload = [
        {
            "ticker": r.ticker,
            "name": r.name,
            "market": r.market,
            "is_preferred": r.is_preferred,
            "shares_outstanding": r.shares_outstanding,
            "market_cap": r.market_cap,
        }
        for r in rows_list
    ]
    with engine.begin() as conn:
        conn.execute(_UPSERT_SQL, payload)
    return len(rows_list)


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync KRX stock master into stocks table")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Fetch full KOSPI+KOSDAQ universe (default: 3 test tickers only)",
    )
    args = parser.parse_args()

    print(f"[stocks] mode = {'ALL' if args.all else 'TEST (3 tickers)'}")
    rows = fetch_all_stocks() if args.all else fetch_test_stocks()
    if not rows:
        print("[stocks] no rows fetched, abort", file=sys.stderr)
        return 1
    n = upsert(rows)
    print(f"[stocks] upserted {n} rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
