"""엣지 케이스 검증.

(c) 음수 표기: '-1234', '(1234)', '1,234.56' 모두 처리되는지
(a) 별도재무제표(OFS)만 있는 회사: CFS empty 시 OFS 폴백 필요한지
(b) K-IFRS 미적용 소형 KOSDAQ: 랜덤 샘플 10개 NULL 통계
"""
from __future__ import annotations
import os, sys, random
sys.stdout.reconfigure(encoding="utf-8")

import OpenDartReader
from sync import env  # noqa
from sync.financials import ACCOUNT_MAP, _to_int
from sync.db import get_engine
from sqlalchemy import text

dart = OpenDartReader(os.environ["OPENDART_API_KEY"])

NEED_COLS = {"revenue", "operating_income", "net_income", "eps"}


def extract(df) -> dict[str, object | None]:
    out = {c: None for c in NEED_COLS}
    if df is None or df.empty:
        return out
    for _, r in df.iterrows():
        key = (r.get("sj_div"), r.get("account_id"))
        if key in ACCOUNT_MAP and ACCOUNT_MAP[key] in NEED_COLS:
            col = ACCOUNT_MAP[key]
            if out[col] is None:
                out[col] = r.get("thstrm_amount")
    return out


print("===== (c) 음수 처리 _to_int =====")
cases = [
    ("-1234", -1234),
    ("(1234)", None),  # DART는 마이너스 부호 사용. 괄호는 일부 PDF 양식이지만 API는 마이너스.
    ("1,234,567", 1234567),
    ("1234.56", 1234),
    ("0", 0),
    ("-", None),
    (None, None),
    ("", None),
    ("  -45,000  ", -45000),
]
for inp, expected in cases:
    got = _to_int(inp)
    ok = "✓" if got == expected else "✗"
    print(f"  {ok} _to_int({inp!r}) -> {got!r}, expected {expected!r}")


print("\n===== (a) CFS vs OFS 비교 (random 5종목) =====")
e = get_engine()
with e.connect() as c:
    samples = c.execute(text(
        "select s.ticker, s.name, s.corp_code from stocks s "
        "where s.corp_code is not null and not s.is_preferred "
        "order by random() limit 5"
    )).all()

cfs_only = ofs_only = both = neither = 0
for r in samples:
    print(f"\n  {r.ticker} {r.name}")
    cfs = dart.finstate_all(r.corp_code, 2024, reprt_code="11011")
    cfs_data = extract(cfs)
    cfs_has = any(v is not None for v in cfs_data.values())
    print(f"    CFS: {sum(v is not None for v in cfs_data.values())}/4 fields filled")
    try:
        ofs = dart.finstate_all(r.corp_code, 2024, reprt_code="11011", fs_div="OFS")
    except Exception as ex:
        ofs = None
        print(f"    OFS: error {ex}")
    ofs_data = extract(ofs)
    ofs_has = any(v is not None for v in ofs_data.values())
    print(f"    OFS: {sum(v is not None for v in ofs_data.values())}/4 fields filled")
    if cfs_has and ofs_has:
        both += 1
    elif cfs_has:
        cfs_only += 1
    elif ofs_has:
        ofs_only += 1; print(f"    ★ OFS-ONLY case! Need fallback.")
    else:
        neither += 1
print(f"\n  Summary: both={both} cfs_only={cfs_only} ofs_only={ofs_only} neither={neither}")


print("\n===== (b) KOSDAQ 소형주 10개 (시총 하위) NULL 통계 =====")
with e.connect() as c:
    smalls = c.execute(text(
        "select s.ticker, s.name, s.corp_code, s.market_cap from stocks s "
        "where s.market = 'KOSDAQ' and s.corp_code is not null and not s.is_preferred "
        "and s.market_cap is not null "
        "order by s.market_cap asc limit 10"
    )).all()

null_count = 0
for r in smalls:
    cfs = dart.finstate_all(r.corp_code, 2024, reprt_code="11011")
    data = extract(cfs)
    n_filled = sum(v is not None for v in data.values())
    mcap_b = int(r.market_cap) / 1_000_000_000
    flag = "✓" if n_filled == 4 else ("△" if n_filled > 0 else "✗")
    print(f"  {flag} {r.ticker} {r.name[:14]:<14} mcap={mcap_b:.1f}B | filled={n_filled}/4")
    if n_filled == 0:
        null_count += 1
print(f"\n  All-NULL count: {null_count}/10")
