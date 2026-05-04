"""depreciation, EPS, current_assets/liabilities 등 account_id 프로빙."""
from __future__ import annotations
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")

import OpenDartReader  # noqa: E402
from sync import env  # noqa: F401, E402

dart = OpenDartReader(os.environ["OPENDART_API_KEY"])
df = dart.finstate_all("00126380", 2024, reprt_code="11011")

print(f"shape: {df.shape}, columns: {list(df.columns)}\n")

# 우리가 관심 있는 키워드
queries = {
    "유동자산/유동부채": ["유동자산", "유동부채", "비유동"],
    "EPS/BPS": ["주당", "기본주당", "희석주당", "EPS", "BPS"],
    "감가상각 (한)": ["감가", "유형자산상각"],
    "감가상각 by account_id (영)": [],  # account_id로 별도 검색 (아래)
    "주식수": ["발행주식", "주식수", "보통주", "유통주식", "Issued"],
}

for label, kws in queries.items():
    print(f"===== {label} =====")
    if not kws:
        continue
    mask = df["account_nm"].str.contains("|".join(kws), na=False)
    sub = df[mask][["sj_div", "account_id", "account_nm", "thstrm_amount"]]
    if sub.empty:
        print("  (no match)\n")
        continue
    seen = set()
    for _, r in sub.iterrows():
        key = (r["sj_div"], r["account_id"])
        if key in seen:
            continue
        seen.add(key)
        print(f"  [{r['sj_div']}] {r['account_id']:<70} | {r['account_nm']:<25} | {r['thstrm_amount']}")
    print()

# account_id 직접 검색 (영문 키워드)
print("===== account_id에 'Depreciation' 또는 'Amortisation' =====")
mask = df["account_id"].str.contains("Depreciation|Amortisation|Amortization", na=False, case=False)
sub = df[mask][["sj_div", "account_id", "account_nm", "thstrm_amount"]].drop_duplicates()
for _, r in sub.iterrows():
    print(f"  [{r['sj_div']}] {r['account_id']:<70} | {r['account_nm']:<25} | {r['thstrm_amount']}")
print()

print("===== CF 영역 전체 (감가상각 위치 확인) =====")
cf_rows = df[df["sj_div"] == "CF"][["account_id", "account_nm", "thstrm_amount"]]
for _, r in cf_rows.iterrows():
    print(f"  {r['account_id']:<80} | {r['account_nm']:<35} | {r['thstrm_amount']}")
