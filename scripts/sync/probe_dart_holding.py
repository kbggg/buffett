"""실패한 종목의 DART 응답 직접 확인."""
import os
import sys
sys.stdout.reconfigure(encoding="utf-8")

import OpenDartReader
from sync import env  # noqa
from sync.db import get_engine
from sqlalchemy import text

dart = OpenDartReader(os.environ["OPENDART_API_KEY"])

# Y2024 연간이 NULL 처리된 종목 3개
e = get_engine()
with e.connect() as c:
    failed = c.execute(text("""
        select s.ticker, s.name, s.corp_code from financials f
        join stocks s on s.ticker = f.ticker
        where f.fiscal_year=2024 and f.period_type='A' and f.revenue is null
        order by random() limit 3
    """)).all()

for r in failed:
    print(f"\n===== {r.ticker} {r.name} (corp_code={r.corp_code}) =====")
    df = dart.finstate_all(r.corp_code, 2024, reprt_code="11011")
    if df is None or df.empty:
        print("  (empty response)")
        continue
    is_rows = df[df["sj_div"] == "IS"][["account_id", "account_nm", "thstrm_amount"]].drop_duplicates()
    if is_rows.empty:
        # CIS도 시도
        is_rows = df[df["sj_div"] == "CIS"][["account_id", "account_nm", "thstrm_amount"]].drop_duplicates()
        print("  (no IS rows; showing CIS)")
    print(f"  IS/CIS account_ids:")
    for _, row in is_rows.head(20).iterrows():
        print(f"    {row['account_id']:<60} | {row['account_nm']:<20} | {row['thstrm_amount']}")
