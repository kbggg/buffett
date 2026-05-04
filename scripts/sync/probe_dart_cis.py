"""1단계 보고(CIS만 있는) 회사의 매출/순이익 위치 확인."""
import os, sys
sys.stdout.reconfigure(encoding="utf-8")

import OpenDartReader
from sync import env  # noqa

dart = OpenDartReader(os.environ["OPENDART_API_KEY"])

# 대원제약 (CIS-only 보고로 추정)
df = dart.finstate_all("00111999", 2024, reprt_code="11011")

print(f"unique sj_div: {sorted(df['sj_div'].unique().tolist())}\n")

for sj in sorted(df["sj_div"].unique()):
    sub = df[df["sj_div"] == sj][["account_id", "account_nm", "thstrm_amount"]].drop_duplicates(["account_id", "account_nm"])
    print(f"===== sj_div = {sj} ({len(sub)} unique rows) =====")
    for _, r in sub.iterrows():
        amt = r["thstrm_amount"] or ""
        print(f"  {r['account_id']:<70} | {r['account_nm']:<30} | {amt}")
    print()
