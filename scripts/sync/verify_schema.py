"""Verify table columns after migration."""
import sys
sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import text  # noqa: E402

from sync.db import get_engine  # noqa: E402


def main() -> int:
    engine = get_engine()
    with engine.connect() as conn:
        for tbl in ("stocks", "financials"):
            rows = conn.execute(text(
                "select column_name, data_type from information_schema.columns "
                "where table_name = :t order by ordinal_position"
            ), {"t": tbl}).all()
            print(f"\n=== {tbl} ===")
            for r in rows:
                print(f"  {r.column_name}: {r.data_type}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
