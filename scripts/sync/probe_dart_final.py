"""최종 검증: CF 항목, 무형자산 CapEx, OFS-only 비중."""
from __future__ import annotations
import os, sys
sys.stdout.reconfigure(encoding="utf-8")

import OpenDartReader
from sync import env  # noqa
from sync.financials import ACCOUNT_MAP, _to_int
from sync.db import get_engine
from sqlalchemy import text

dart = OpenDartReader(os.environ["OPENDART_API_KEY"])
e = get_engine()

T = 1_000_000_000_000

# ===== (1) CF 항목 다종목 검증 =====
print("===== (1) CF (operating_cash_flow, capex) 다종목 검증 =====")
samples_1 = [
    ("005930", "삼성전자"),
    ("105560", "KB금융"),
    ("055550", "신한지주"),
    ("032830", "삼성생명"),
    ("000810", "삼성화재"),
    ("003490", "대한항공"),
    ("028050", "삼성E&A"),
    ("003670", "포스코퓨처엠"),
    ("145270", "케이탑리츠"),
    ("000660", "SK하이닉스"),
    ("207940", "삼성바이오로직스"),
    ("035420", "NAVER"),
    ("035720", "카카오"),
    ("003220", "대원제약"),
]

for ticker, name in samples_1:
    with e.connect() as c:
        cc = c.execute(text("select corp_code from stocks where ticker=:t"), {"t": ticker}).scalar()
    if not cc:
        continue
    df = dart.finstate_all(cc, 2024, reprt_code="11011")
    if df is None or df.empty:
        print(f"  ✗ {ticker} {name}: empty")
        continue
    ocf = capex_ppe = capex_intangible = None
    for _, r in df.iterrows():
        if r.get("sj_div") != "CF":
            continue
        aid = r.get("account_id")
        if aid == "ifrs-full_CashFlowsFromUsedInOperatingActivities":
            ocf = _to_int(r.get("thstrm_amount"))
        elif aid == "ifrs-full_PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities":
            capex_ppe = _to_int(r.get("thstrm_amount"))
        elif aid == "ifrs-full_PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities":
            capex_intangible = _to_int(r.get("thstrm_amount"))
    def f(v):
        if v is None: return "NULL"
        return f"{v/T:.2f}조"
    flag = "✓" if ocf else "✗"
    print(f"  {flag} {ticker} {name:<14} OCF={f(ocf):>8} | CapEx(유형)={f(capex_ppe):>8} | CapEx(무형)={f(capex_intangible):>8}")


# ===== (2) OFS-only 30종목 검증 =====
print("\n===== (2) OFS-only 비중 (30 random 종목) =====")
with e.connect() as c:
    samples_2 = c.execute(text(
        "select s.ticker, s.name, s.corp_code from stocks s "
        "where s.corp_code is not null and not s.is_preferred "
        "order by random() limit 30"
    )).all()

cfs_only = ofs_only = both = neither = 0
ofs_only_list = []

for r in samples_2:
    cfs = dart.finstate_all(r.corp_code, 2024, reprt_code="11011")
    cfs_has = cfs is not None and not cfs.empty and any(
        (row.get("sj_div") == "BS" and row.get("account_id") == "ifrs-full_Assets")
        for _, row in cfs.iterrows()
    )
    try:
        ofs = dart.finstate_all(r.corp_code, 2024, reprt_code="11011", fs_div="OFS")
    except Exception:
        ofs = None
    ofs_has = ofs is not None and not ofs.empty and any(
        (row.get("sj_div") == "BS" and row.get("account_id") == "ifrs-full_Assets")
        for _, row in ofs.iterrows()
    )
    if cfs_has and ofs_has: both += 1
    elif cfs_has: cfs_only += 1
    elif ofs_has:
        ofs_only += 1
        ofs_only_list.append(f"{r.ticker} {r.name}")
    else: neither += 1

print(f"  both    : {both:>2} (CFS+OFS 둘다)")
print(f"  cfs_only: {cfs_only:>2} (대형 연결만)")
print(f"  ofs_only: {ofs_only:>2}  ★ OFS 폴백 필요 케이스")
print(f"  neither : {neither:>2} (DART에 데이터 없음)")
if ofs_only_list:
    print(f"  OFS-only 종목: {ofs_only_list}")


# ===== (3) 무형자산 CapEx 비중 (전체 universe sample) =====
print("\n===== (3) 무형자산 CapEx 비중 (위 12종목 정리) =====")
print("  → IT/바이오/통신 등은 무형자산 CapEx가 더 클 수 있음")
print("  → 우리 매핑에 추가 권장: capex = 유형 + 무형")
