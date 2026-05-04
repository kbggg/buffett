"""OpenDART corp_code → KRX ticker 매핑 동기화.

OpenDART는 모든 공시 API에서 회사를 `corp_code`(8자리)로 식별한다.
주식 ticker(6자리)와의 매핑은 corpCode.xml 한 번 받아서 처리.

이 스크립트는 stocks 테이블에 이미 존재하는 ticker에 한해 corp_code를 채운다.
(존재하지 않는 ticker를 새로 INSERT하지는 않는다 — 그건 stocks.py 책임)
"""

from __future__ import annotations

import argparse
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

import OpenDartReader  # noqa: E402
from sqlalchemy import text  # noqa: E402

from sync.db import get_engine  # noqa: E402


def fetch_corp_code_map() -> dict[str, str]:
    """OpenDART에서 전체 corp_code 목록을 받아 {ticker: corp_code} 사전을 만든다.

    한 번의 API 호출(corpCode.xml)이 ~100k 회사 정보를 담는 ZIP을 반환한다.
    상장사만(stock_code 비어있지 않음) 필터.
    """
    api_key = os.getenv("OPENDART_API_KEY")
    if not api_key:
        raise RuntimeError("OPENDART_API_KEY not set in scripts/.env or .env.local")

    dart = OpenDartReader(api_key)
    df = dart.corp_codes  # pandas.DataFrame: corp_code, corp_name, stock_code, modify_date

    # stock_code가 None/빈문자열이 아닌 행만
    listed = df[df["stock_code"].notna() & (df["stock_code"].str.strip() != "")]
    mapping: dict[str, str] = {}
    for _, row in listed.iterrows():
        ticker = str(row["stock_code"]).strip().zfill(6)
        corp_code = str(row["corp_code"]).strip().zfill(8)
        mapping[ticker] = corp_code
    return mapping


_UPDATE_SQL = text(
    "update stocks set corp_code = :corp_code, updated_at = now() "
    "where ticker = :ticker and (corp_code is null or corp_code <> :corp_code)"
)


def update_existing_stocks(mapping: dict[str, str]) -> tuple[int, int]:
    """stocks 테이블에 이미 있는 ticker 행에 한해 corp_code를 채운다.

    Returns: (matched_count, updated_count)
    """
    engine = get_engine()
    matched = 0
    updated = 0
    with engine.begin() as conn:
        existing = conn.execute(text("select ticker from stocks")).all()
        existing_tickers = {r.ticker for r in existing}
        for ticker, corp_code in mapping.items():
            if ticker not in existing_tickers:
                continue
            matched += 1
            result = conn.execute(
                _UPDATE_SQL, {"ticker": ticker, "corp_code": corp_code}
            )
            updated += result.rowcount or 0
    return matched, updated


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync OpenDART corp_code into stocks.corp_code")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch the mapping and report counts but do not update DB",
    )
    args = parser.parse_args()

    print("[corp_codes] fetching OpenDART corpCode.xml ...")
    mapping = fetch_corp_code_map()
    print(f"[corp_codes] listed companies in OpenDART: {len(mapping)}")

    if args.dry_run:
        # 테스트 티커 3개 매핑이 보이는지 확인
        for t in ("005930", "000660", "035720"):
            print(f"  sample: {t} -> {mapping.get(t, '<not found>')}")
        return 0

    matched, updated = update_existing_stocks(mapping)
    print(f"[corp_codes] matched in stocks table: {matched}")
    print(f"[corp_codes] rows actually updated: {updated}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
