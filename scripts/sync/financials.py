"""분기/연간 재무제표 수집 (OpenDART finstate_all).

원칙:
- 연결재무제표(CFS) 기준 (OpenDartReader 기본값).
- 표준 IFRS account_id로 매칭. 같은 account_id가 여러 sj_div(IS, BS, CF, SCE)에
  중복 등장하므로 sj_div 까지 같이 매칭해서 잘못된 행을 집지 않도록.
- 분기보고서 reprt_code: 11013(1Q), 11012(2Q=반기), 11014(3Q), 11011(사업보고서=연간/4Q).
- thstrm_amount: 당분기 / 당기. 누적은 thstrm_add_amount (현재는 미사용).
- report_date: rcept_no(14자리) 의 앞 8자리(YYYYMMDD)가 공시 접수일 = 시장에 알려진 날.
  CLAUDE.md "look-ahead bias 방지" 핵심 필드.
- EPS/BPS/주식수: 본 응답엔 없음. 일단 NULL. 후속 단계에서 별도 보강.

CLAUDE.md "테스트는 작은 단위부터": 기본 1종목 × 1년 분기+연간. --all 로 전체.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from dataclasses import dataclass
from datetime import date
from typing import Iterable

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

import OpenDartReader  # noqa: E402
import pandas as pd  # noqa: E402
from sqlalchemy import text  # noqa: E402

from sync.db import get_engine  # noqa: E402
from sync import env  # noqa: F401, E402

# (sj_div, account_id) -> 우리 컬럼명.
# IFRS는 두 가지 보고 방식 허용:
#   - 2단계: IS(손익계산서) + CIS(포괄손익계산서) 분리. 삼성전자 같은 대기업.
#   - 1단계: CIS만 (통합 단일 보고). 한국 상장사 대다수가 이쪽.
# 따라서 매출/영업이익/순이익/EPS 는 IS 와 CIS 둘 다 등록. first-match 우선이라
# IS가 있으면 IS, 없으면 CIS에서 잡힘.
ACCOUNT_MAP: dict[tuple[str, str], str] = {
    # 영업이익 — first-match 우선. dart_OperatingIncomeLoss(일반) > ProfitLossFromOperatingActivities(금융).
    # 같은 회사에 둘 다 있을 가능성 거의 없어 충돌 없음.
    ("IS", "dart_OperatingIncomeLoss"): "operating_income",
    ("CIS", "dart_OperatingIncomeLoss"): "operating_income",
    ("CIS", "ifrs-full_ProfitLossFromOperatingActivities"): "operating_income",
    # 순이익
    ("IS", "ifrs-full_ProfitLoss"): "net_income",
    ("CIS", "ifrs-full_ProfitLoss"): "net_income",
    # EPS
    ("IS", "ifrs-full_BasicEarningsLossPerShare"): "eps",
    ("CIS", "ifrs-full_BasicEarningsLossPerShare"): "eps",
    # 재무상태표
    ("BS", "ifrs-full_Assets"): "total_assets",
    ("BS", "ifrs-full_Equity"): "total_equity",
    # 지배기업 소유주에게 귀속되는 자본 — PBR/BPS 표준 (KIS/네이버와 일치).
    ("BS", "ifrs-full_EquityAttributableToOwnersOfParent"): "equity_attributable_to_owners",
    ("BS", "ifrs-full_Liabilities"): "total_liabilities",
    ("BS", "ifrs-full_CurrentAssets"): "current_assets",
    ("BS", "ifrs-full_CurrentLiabilities"): "current_liabilities",
    # 현금흐름
    ("CF", "ifrs-full_CashFlowsFromUsedInOperatingActivities"): "operating_cash_flow",
    (
        "CF",
        "ifrs-full_PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
    ): "capex",
}

# eps 는 numeric(15,2) 라 정수가 아니라 소수도 허용
EPS_COLS: set[str] = {"eps"}

# reprt_code -> (period_type, fiscal_quarter)
REPRT_TO_PERIOD: dict[str, tuple[str, int | None]] = {
    "11013": ("Q", 1),
    "11012": ("Q", 2),
    "11014": ("Q", 3),
    "11011": ("A", None),  # 사업보고서 = 연간
}


@dataclass
class FinancialRow:
    ticker: str
    corp_code: str
    period_type: str
    fiscal_year: int
    fiscal_quarter: int | None
    report_date: date
    values: dict[str, int | None]  # 우리 컬럼 -> 금액
    raw_count: int  # 원본 행 수 (디버그)


def _to_int(v) -> int | None:
    if v is None:
        return None
    if isinstance(v, str):
        v = v.replace(",", "").strip()
        if not v or v == "-":
            return None
        try:
            return int(v)
        except ValueError:
            try:
                return int(float(v))
            except ValueError:
                return None
    if pd.isna(v):
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _parse_report_date(rcept_no: str | None) -> date | None:
    if not rcept_no or len(str(rcept_no)) < 8:
        return None
    s = str(rcept_no)[:8]
    try:
        return date(int(s[:4]), int(s[4:6]), int(s[6:8]))
    except ValueError:
        return None


def _has_balance_sheet(df) -> bool:
    """응답에 BS의 Assets 행이 있는지 — 진짜 데이터가 있는지의 빠른 판별."""
    if df is None or df.empty:
        return False
    for _, r in df.iterrows():
        if r.get("sj_div") == "BS" and r.get("account_id") == "ifrs-full_Assets":
            return True
    return False


# 매출(revenue)은 명시적 우선순위로 매칭 — 동일 회사에 ifrs-full_RevenueFromInterest(은행)
# 와 ifrs-full_InsuranceRevenue(보험)가 같이 있을 때 잘못된 작은 값을 잡지 않도록.
# 우선순위: 일반매출 > 은행 본업(이자수익) > 보험수익.
REVENUE_PRIORITY: list[tuple[str, str]] = [
    ("IS", "ifrs-full_Revenue"),
    ("CIS", "ifrs-full_Revenue"),
    ("CIS", "ifrs-full_RevenueFromInterest"),
    ("CIS", "ifrs-full_InsuranceRevenue"),
]


def _extract_values(df) -> dict[str, int | None]:
    """ACCOUNT_MAP first-match로 컬럼 값 추출. revenue는 우선순위 매칭, CapEx는 유형+무형 합산."""
    values: dict[str, int | None] = {col: None for col in set(ACCOUNT_MAP.values())}
    values["revenue"] = None
    intangible_capex = None

    # 1차: ACCOUNT_MAP first-match (revenue 제외)
    for _, row in df.iterrows():
        sj = row.get("sj_div")
        aid = row.get("account_id")
        if (
            sj == "CF"
            and aid == "ifrs-full_PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities"
        ):
            intangible_capex = _to_int(row.get("thstrm_amount"))
            continue
        key = (sj, aid)
        if key in ACCOUNT_MAP:
            col = ACCOUNT_MAP[key]
            if values[col] is None:
                values[col] = _to_int(row.get("thstrm_amount"))

    # 2차: revenue는 명시적 우선순위로 — 가장 우선순위 높은 항목이 있으면 그걸 채택
    for sj, aid in REVENUE_PRIORITY:
        match = df[(df["sj_div"] == sj) & (df["account_id"] == aid)]
        if not match.empty:
            v = _to_int(match.iloc[0]["thstrm_amount"])
            if v is not None:
                values["revenue"] = v
                break

    # CapEx = 유형 + 무형 (Buffett Owner Earnings 정확도 개선; IT/금융 무형 비중 큼)
    if intangible_capex is not None:
        if values["capex"] is None:
            values["capex"] = intangible_capex
        else:
            values["capex"] = values["capex"] + intangible_capex
    return values


def fetch_one_period(
    dart: OpenDartReader,
    ticker: str,
    corp_code: str,
    year: int,
    reprt_code: str,
) -> FinancialRow | None:
    """우선 CFS(연결) 시도, 데이터 없으면 OFS(별도)로 폴백.

    한국 상장사의 ~23%는 연결제표를 제출하지 않음(자회사 없는 회사 등). 기본 CFS만
    조회하면 그들의 데이터를 통째로 놓침. _has_balance_sheet 로 실제 데이터 여부
    판단 후 폴백.
    """
    df = dart.finstate_all(corp_code, year, reprt_code=reprt_code)
    used_fs = "CFS"
    if not _has_balance_sheet(df):
        try:
            df_ofs = dart.finstate_all(corp_code, year, reprt_code=reprt_code, fs_div="OFS")
        except Exception:
            df_ofs = None
        if _has_balance_sheet(df_ofs):
            df = df_ofs
            used_fs = "OFS"
        else:
            return None  # 둘 다 없음 (상폐/SPAC/미공시)

    period_type, quarter = REPRT_TO_PERIOD[reprt_code]
    values = _extract_values(df)
    rcept_no = df.iloc[0].get("rcept_no") if len(df) else None
    rdate = _parse_report_date(rcept_no) or date(year, 12, 31)
    return FinancialRow(
        ticker=ticker,
        corp_code=corp_code,
        period_type=period_type,
        fiscal_year=year,
        fiscal_quarter=quarter,
        report_date=rdate,
        values=values,
        raw_count=len(df),
    )


_UPSERT_SQL = text(
    """
    insert into financials (
      ticker, period_type, fiscal_year, fiscal_quarter, report_date,
      revenue, operating_income, net_income, eps,
      total_assets, total_equity, equity_attributable_to_owners, total_liabilities,
      current_assets, current_liabilities,
      operating_cash_flow, capex
    ) values (
      :ticker, :period_type, :fiscal_year, :fiscal_quarter, :report_date,
      :revenue, :operating_income, :net_income, :eps,
      :total_assets, :total_equity, :equity_attributable_to_owners, :total_liabilities,
      :current_assets, :current_liabilities,
      :operating_cash_flow, :capex
    )
    on conflict (ticker, period_type, fiscal_year, fiscal_quarter) do update set
      report_date = excluded.report_date,
      revenue = excluded.revenue,
      operating_income = excluded.operating_income,
      net_income = excluded.net_income,
      eps = excluded.eps,
      total_assets = excluded.total_assets,
      total_equity = excluded.total_equity,
      equity_attributable_to_owners = excluded.equity_attributable_to_owners,
      total_liabilities = excluded.total_liabilities,
      current_assets = excluded.current_assets,
      current_liabilities = excluded.current_liabilities,
      operating_cash_flow = excluded.operating_cash_flow,
      capex = excluded.capex
    """
)


def upsert(rows: Iterable[FinancialRow]) -> int:
    engine = get_engine()
    rows_list = list(rows)
    if not rows_list:
        return 0
    payload = [
        {
            "ticker": r.ticker,
            "period_type": r.period_type,
            "fiscal_year": r.fiscal_year,
            "fiscal_quarter": r.fiscal_quarter,
            "report_date": r.report_date,
            **r.values,
        }
        for r in rows_list
    ]
    with engine.begin() as conn:
        conn.execute(_UPSERT_SQL, payload)
    return len(rows_list)


def list_targets(
    only_corp_code: bool = True,
    markets: list[str] | None = None,
) -> list[tuple[str, str]]:
    engine = get_engine()
    sql = "select ticker, corp_code from stocks where not is_preferred"
    params: dict = {}
    if only_corp_code:
        sql += " and corp_code is not null"
    if markets:
        placeholders = ",".join(f":m{i}" for i in range(len(markets)))
        sql += f" and market in ({placeholders})"
        params.update({f"m{i}": m for i, m in enumerate(markets)})
    sql += " order by ticker"
    with engine.connect() as conn:
        return [(r.ticker, r.corp_code) for r in conn.execute(text(sql), params).all()]


def main() -> int:
    p = argparse.ArgumentParser(description="Sync OpenDART financials")
    p.add_argument("--all", action="store_true", help="all stocks (default: 1 test ticker)")
    p.add_argument("--years", type=int, default=5, help="years back (default 5)")
    p.add_argument("--end-year", type=int, default=date.today().year - 1,
                   help="latest fiscal year to fetch (default: previous calendar year)")
    p.add_argument("--sleep", type=float, default=0.05,
                   help="seconds between API calls (rate limit; default 0.05)")
    p.add_argument(
        "--ticker",
        action="append",
        help="single ticker (test mode); repeatable. default: 005930",
    )
    p.add_argument(
        "--markets", default="KOSPI",
        help="comma-separated markets to include (default: KOSPI; e.g. 'KOSPI,KOSDAQ')",
    )
    args = p.parse_args()

    api_key = os.environ.get("OPENDART_API_KEY")
    if not api_key:
        print("OPENDART_API_KEY not set", file=sys.stderr)
        return 2
    dart = OpenDartReader(api_key)

    markets = [m.strip().upper() for m in args.markets.split(",") if m.strip()]
    if args.all:
        targets = list_targets(markets=markets)
        print(f"[financials] mode = ALL ({len(targets)} stocks in {markets}, {args.years}y back, end_year={args.end_year})")
    else:
        wanted = args.ticker or ["005930"]
        all_targets = dict(list_targets(only_corp_code=True))  # 테스트 모드는 마켓 무시
        targets = [(t, all_targets[t]) for t in wanted if t in all_targets]
        if not targets:
            print(f"[financials] no matching targets in DB for: {wanted}", file=sys.stderr)
            return 1
        print(f"[financials] mode = TEST ({len(targets)} stocks, {args.years}y back)")

    years = list(range(args.end_year - args.years + 1, args.end_year + 1))
    reprt_codes = ["11013", "11012", "11014", "11011"]
    total = len(targets) * len(years) * len(reprt_codes)
    print(f"[financials] total API calls planned: {total} ({len(targets)} stocks × {len(years)} years × {len(reprt_codes)} reports)")

    fetched_rows = 0
    upserted = 0
    fails: list[tuple[str, int, str, str]] = []
    t0 = time.time()
    pending: list[FinancialRow] = []
    for i, (ticker, corp_code) in enumerate(targets, 1):
        for year in years:
            for rc in reprt_codes:
                try:
                    row = fetch_one_period(dart, ticker, corp_code, year, rc)
                    if row:
                        pending.append(row)
                        fetched_rows += 1
                except Exception as e:
                    fails.append((ticker, year, rc, repr(e)[:120]))
                if args.sleep > 0:
                    time.sleep(args.sleep)
        # Flush per ticker
        if pending:
            upserted += upsert(pending)
            pending.clear()
        if not args.all or i % 25 == 0 or i == len(targets):
            elapsed = time.time() - t0
            rate = i / elapsed if elapsed > 0 else 0
            eta = (len(targets) - i) / rate if rate > 0 else 0
            print(
                f"  [{i:>4}/{len(targets)}] {ticker}: cumulative fetched={fetched_rows} upserted={upserted} "
                f"| {elapsed:.0f}s elapsed, ~{eta:.0f}s ETA"
            )

    print(f"\n[financials] done: fetched={fetched_rows} upserted={upserted} in {time.time() - t0:.0f}s")
    if fails:
        print(f"[financials] failures: {len(fails)} (first 10):")
        for tk, yr, rc, msg in fails[:10]:
            print(f"  - {tk} {yr} {rc}: {msg}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
