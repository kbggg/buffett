"""테이블에 들어간 stocks 행을 직접 확인."""

from __future__ import annotations

import sys

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

from sqlalchemy import text  # noqa: E402

from sync.db import get_engine  # noqa: E402


def main() -> int:
    engine = get_engine()
    with engine.connect() as conn:
        summary = conn.execute(text(
            """
            select market,
                   count(*) as total,
                   count(*) filter (where is_preferred) as preferred,
                   count(*) filter (where corp_code is not null) as with_corp_code,
                   count(*) filter (where corp_code is null) as missing_corp_code
            from stocks
            group by market
            order by market
            """
        )).all()
        print("=== Per market ===")
        for r in summary:
            print(
                f"  {r.market:<7} total={r.total:>4} | preferred={r.preferred:>3} "
                f"| corp_code OK={r.with_corp_code:>4} | missing={r.missing_corp_code:>3}"
            )

        total = conn.execute(text("select count(*) from stocks")).scalar_one()
        print(f"\nGRAND TOTAL: {total}")

        print("\n=== Sample: 3 known test tickers ===")
        rows = conn.execute(text(
            "select ticker, name, market, corp_code, is_preferred from stocks "
            "where ticker in ('005930','000660','035720') order by ticker"
        )).all()
        for r in rows:
            print(
                f"  {r.ticker} | {r.name:<12} | {r.market} "
                f"| corp_code={r.corp_code or '-':<8} | pref={r.is_preferred}"
            )

        print("\n=== Sample: 5 stocks missing corp_code ===")
        missing = conn.execute(text(
            "select ticker, name, market from stocks "
            "where corp_code is null order by ticker limit 5"
        )).all()
        for r in missing:
            print(f"  {r.ticker} | {r.name:<25} | {r.market}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
