"""Verify shares_outstanding/market_cap on stocks and current_assets/eps on financials."""
import sys
sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import text  # noqa: E402

from sync.db import get_engine  # noqa: E402

T = 1_000_000_000_000


def main() -> int:
    e = get_engine()
    with e.connect() as c:
        print("=== stocks (top 5 by market_cap) ===")
        rows = c.execute(text(
            "select ticker, name, shares_outstanding, market_cap "
            "from stocks where market_cap is not null "
            "order by market_cap desc nulls last limit 5"
        )).all()
        for r in rows:
            mc = f"{int(r.market_cap)/T:.2f}조" if r.market_cap else "-"
            so = f"{int(r.shares_outstanding):,}" if r.shares_outstanding else "-"
            print(f"  {r.ticker} | {r.name:<14} | shares={so:<18} | mcap={mc}")

        print("\n=== financials 005930 (last 4 periods, with current_assets/eps) ===")
        rows = c.execute(text(
            "select fiscal_year, fiscal_quarter, period_type, "
            "current_assets, current_liabilities, eps "
            "from financials where ticker = '005930' "
            "order by fiscal_year desc, coalesce(fiscal_quarter, 99) desc limit 6"
        )).all()
        for r in rows:
            ca = f"{int(r.current_assets)/T:.2f}조" if r.current_assets else "-"
            cl = f"{int(r.current_liabilities)/T:.2f}조" if r.current_liabilities else "-"
            eps = f"{float(r.eps):.0f}원" if r.eps is not None else "-"
            cr = (
                f"{int(r.current_assets) / int(r.current_liabilities):.2f}"
                if (r.current_assets and r.current_liabilities) else "-"
            )
            print(
                f"  {r.fiscal_year} Q{r.fiscal_quarter or '-'} {r.period_type} | "
                f"CA={ca:>8} | CL={cl:>8} | CR={cr:>4} | EPS={eps}"
            )

        print("\n=== sample: stocks without shares (potential FDR misses) ===")
        rows = c.execute(text(
            "select ticker, name, market from stocks "
            "where shares_outstanding is null limit 5"
        )).all()
        if not rows:
            print("  (none)")
        for r in rows:
            print(f"  {r.ticker} | {r.name} | {r.market}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
