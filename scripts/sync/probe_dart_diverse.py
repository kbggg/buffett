"""다양한 업종 종목의 DART 응답 매핑 검증.

각 종목에 대해 우리 ACCOUNT_MAP이 매출/영업이익/순이익을 정상 추출하는지 확인.
추출 실패한 행은 그 회사의 IS/CIS account_id 전체를 덤프해서 새 매핑 후보 식별.
"""
from __future__ import annotations
import os, sys
sys.stdout.reconfigure(encoding="utf-8")

import OpenDartReader
from sync import env  # noqa
from sync.financials import ACCOUNT_MAP

dart = OpenDartReader(os.environ["OPENDART_API_KEY"])

# 업종별 1~2개씩, 시총/대표성 고려
SAMPLES = [
    ("105560", "KB금융 (은행지주)"),
    ("055550", "신한지주 (은행지주)"),
    ("032830", "삼성생명 (보험)"),
    ("000810", "삼성화재 (보험)"),
    ("003490", "대한항공 (항공)"),
    ("028050", "삼성E&A (건설)"),
    ("003670", "포스코퓨처엠 (소재)"),
    ("145270", "케이탑리츠 (REIT)"),
    ("091990", "셀트리온헬스케어 (바이오)"),
    ("000660", "SK하이닉스 (반도체)"),
    ("207940", "삼성바이오로직스"),
    ("035420", "NAVER"),
]

NEED_COLS = {"revenue", "operating_income", "net_income", "eps"}

for ticker, label in SAMPLES:
    # corp_code 조회
    info = dart.find_corp_code(label.split()[0]) if False else None
    # OpenDartReader 의 .corp_codes 캐시 활용
    cc_df = dart.corp_codes
    row = cc_df[cc_df["stock_code"].astype(str).str.zfill(6) == ticker]
    if row.empty:
        print(f"\n{ticker} {label}: corp_code not found"); continue
    corp_code = str(row.iloc[0]["corp_code"]).zfill(8)

    df = dart.finstate_all(corp_code, 2024, reprt_code="11011")
    if df is None or df.empty:
        print(f"\n{ticker} {label} (corp={corp_code}): empty response"); continue

    # 우리 매핑으로 추출
    extracted = {col: None for col in NEED_COLS}
    for _, r in df.iterrows():
        key = (r.get("sj_div"), r.get("account_id"))
        if key in ACCOUNT_MAP and ACCOUNT_MAP[key] in NEED_COLS:
            col = ACCOUNT_MAP[key]
            if extracted[col] is None:
                extracted[col] = r.get("thstrm_amount")

    missing = [c for c, v in extracted.items() if not v]
    status = "✓ OK" if not missing else f"✗ MISSING: {missing}"
    print(f"\n===== {ticker} {label} (corp={corp_code}) — {status} =====")
    for col, v in extracted.items():
        print(f"    {col}: {v}")

    if missing:
        # IS/CIS 전체 덤프 (매출/이익 비슷한 항목 찾기 위해)
        print(f"  --- IS/CIS account_ids in response ---")
        for sj in ("IS", "CIS"):
            sub = df[df["sj_div"] == sj][["account_id", "account_nm", "thstrm_amount"]].drop_duplicates(["account_id"])
            if sub.empty:
                continue
            print(f"    [sj_div={sj}]")
            for _, r in sub.iterrows():
                aid = r["account_id"] or ""
                # 매출/이익 관련만 추려보기
                kws = ["Revenue", "Income", "Profit", "Operating", "EarningsLoss", "Sales", "Interest"]
                if any(k in aid for k in kws) or "당기" in (r["account_nm"] or "") or "매출" in (r["account_nm"] or "") or "영업" in (r["account_nm"] or ""):
                    print(f"      {aid:<70} | {r['account_nm']:<30} | {r['thstrm_amount']}")
