"""OpenDART 재무제표 응답 구조 프로빙.

목적:
- finstate vs finstate_all 의 차이
- 컬럼 매핑(매출/영업이익/순이익/총자산/총부채/자본/영업CF/CapEx/주식수)
- 분기/연간 구분 코드 의미
- 연결재무제표 vs 별도재무제표 (CFS vs OFS)
"""
from __future__ import annotations

import os
import sys

sys.stdout.reconfigure(encoding="utf-8")

import OpenDartReader  # noqa: E402

from sync import env  # noqa: F401, E402

api_key = os.environ["OPENDART_API_KEY"]
dart = OpenDartReader(api_key)

CORP_CODE = "00126380"  # 삼성전자
YEAR = 2024
REPORT_CODES = {
    "11013": "1Q",
    "11012": "반기(2Q)",
    "11014": "3Q",
    "11011": "사업보고서(연간)",
}

print("===== finstate (단순, 주요계정) =====")
df = dart.finstate(CORP_CODE, YEAR, reprt_code="11011")
print(f"shape: {None if df is None else df.shape}")
if df is not None and not df.empty:
    print(f"columns: {list(df.columns)}")
    print(df.head(20))
else:
    print("(empty)")

print("\n===== finstate_all (전체계정) =====")
df = dart.finstate_all(CORP_CODE, YEAR, reprt_code="11011")
print(f"shape: {None if df is None else df.shape}")
if df is not None and not df.empty:
    print(f"columns: {list(df.columns)}")
    # 핵심 계정 키워드만 필터
    keywords = ["매출", "영업이익", "당기순이익", "자산총계", "부채총계", "자본총계", "영업활동", "투자활동", "유형자산"]
    mask = df["account_nm"].str.contains("|".join(keywords), na=False) if "account_nm" in df.columns else None
    if mask is not None:
        cols = [c for c in ["sj_div", "sj_nm", "account_id", "account_nm", "thstrm_amount", "thstrm_add_amount"] if c in df.columns]
        sub = df[mask][cols].head(50)
        print("\n--- 매칭 행 (최대 50) ---")
        print(sub.to_string())

print("\n===== 분기 보고서 (1Q 2024) =====")
df = dart.finstate_all(CORP_CODE, YEAR, reprt_code="11013")
print(f"shape: {None if df is None else df.shape}")
if df is not None and not df.empty:
    print(f"unique fs_div: {df['fs_div'].unique() if 'fs_div' in df.columns else 'n/a'}")
    print(f"unique sj_div: {df['sj_div'].unique() if 'sj_div' in df.columns else 'n/a'}")
