"""financials의 중복 행 정리.

(ticker, period_type, fiscal_year, fiscal_quarter) 같은 행이 여러 개면
created_at 가장 늦은 것 1개 남기고 나머지 삭제. 마이그레이션 전에 실행.
"""
import sys

sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import text  # noqa: E402

from sync.db import get_engine  # noqa: E402


def main() -> int:
    engine = get_engine()
    with engine.begin() as conn:
        # 중복 그룹 탐색
        dups = conn.execute(text(
            """
            select ticker, period_type, fiscal_year, fiscal_quarter, count(*) as n
            from financials
            group by ticker, period_type, fiscal_year, fiscal_quarter
            having count(*) > 1
            """
        )).all()
        print(f"duplicate groups: {len(dups)}")
        for d in dups[:5]:
            print(f"  {d.ticker} {d.period_type} {d.fiscal_year} Q{d.fiscal_quarter}: x{d.n}")

        # 그룹별로 가장 최근 created_at 만 남기고 삭제
        deleted = conn.execute(text(
            """
            delete from financials
            where id in (
              select id from (
                select id, row_number() over (
                  partition by ticker, period_type, fiscal_year, fiscal_quarter
                  order by created_at desc, id desc
                ) as rn
                from financials
              ) sub
              where rn > 1
            )
            """
        )).rowcount
        print(f"deleted: {deleted} rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
