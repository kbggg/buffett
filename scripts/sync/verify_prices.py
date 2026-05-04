"""prices 테이블 검증."""
import sys
sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import text  # noqa: E402

from sync.db import get_engine  # noqa: E402


def main() -> int:
    engine = get_engine()
    with engine.connect() as conn:
        per_ticker = conn.execute(text(
            """
            select p.ticker, s.name, count(*) as days,
                   min(p.date) as first_date, max(p.date) as last_date,
                   max(p.close) as max_close, min(p.close) as min_close
            from prices p
            join stocks s on s.ticker = p.ticker
            group by p.ticker, s.name
            order by p.ticker
            limit 20
            """
        )).all()
        print("=== Per ticker (first 20) ===")
        for r in per_ticker:
            print(
                f"  {r.ticker} | {r.name:<12} | days={r.days:>4} "
                f"| {r.first_date} → {r.last_date} | close [{r.min_close}, {r.max_close}]"
            )

        total = conn.execute(text("select count(*) from prices")).scalar_one()
        n_tickers = conn.execute(text("select count(distinct ticker) from prices")).scalar_one()
        print(f"\nGRAND TOTAL: {total} rows across {n_tickers} tickers")

        # Sample latest 3 rows for 005930
        print("\n=== Latest 3 rows for 005930 (삼성전자) ===")
        latest = conn.execute(text(
            "select date, open, high, low, close, volume "
            "from prices where ticker = '005930' order by date desc limit 3"
        )).all()
        for r in latest:
            print(f"  {r.date} | O={r.open} H={r.high} L={r.low} C={r.close} V={r.volume}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
