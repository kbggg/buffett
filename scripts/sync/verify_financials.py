"""financials 검증 — 1조 단위로 표시."""
import sys
sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import text  # noqa: E402

from sync.db import get_engine  # noqa: E402

TRILLION = 1_000_000_000_000


def fmt(v):
    if v is None:
        return "-"
    return f"{int(v) / TRILLION:>7.2f}조"


def main() -> int:
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(text(
            """
            select fiscal_year, fiscal_quarter, period_type, report_date,
                   revenue, operating_income, net_income,
                   total_assets, total_equity, operating_cash_flow, capex
            from financials
            where ticker = '005930'
            order by fiscal_year desc, coalesce(fiscal_quarter, 99) desc
            """
        )).all()
    if not rows:
        print("(empty)")
        return 0
    print(f"{'Year':<6} {'Q':<3} {'Type':<5} {'Report':<12} {'Revenue':>10} {'OpInc':>10} {'NetInc':>10} {'Assets':>10} {'Equity':>10} {'OpCF':>10} {'CapEx':>10}")
    print("-" * 120)
    for r in rows:
        print(
            f"{r.fiscal_year:<6} {str(r.fiscal_quarter or '-'):<3} {r.period_type:<5} {str(r.report_date):<12} "
            f"{fmt(r.revenue):>10} {fmt(r.operating_income):>10} {fmt(r.net_income):>10} "
            f"{fmt(r.total_assets):>10} {fmt(r.total_equity):>10} {fmt(r.operating_cash_flow):>10} "
            f"{fmt(r.capex):>10}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
