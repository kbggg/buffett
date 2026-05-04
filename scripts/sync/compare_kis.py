"""KIS Developers API 와 우리 계산값(PBR/PER) 비교.

목적: 우리 계산이 정확한지 시세 정보 제공자(KIS)와 대조 검증.

사용 API:
- POST /oauth2/tokenP            토큰 발급 (24h 유효)
- GET  /uapi/domestic-stock/v1/quotations/inquire-price  현재가 + 비율

mock(모의투자) / real(실전) base URL이 다름. KIS_ENV 로 전환.
"""
from __future__ import annotations

import os
import sys
from typing import Any

sys.stdout.reconfigure(encoding="utf-8")

import requests  # noqa: E402
from sqlalchemy import text  # noqa: E402

from sync import env  # noqa: F401, E402
from sync.db import get_engine  # noqa: E402

# 검증할 종목 (Top 매수후보 + 대형주 비교)
SAMPLE_TICKERS = [
    "005930",  # 삼성전자
    "000660",  # SK하이닉스
    "009970",  # 영원무역홀딩스 (Top 매수후보)
    "111770",  # 영원무역
    "105560",  # KB금융
    "035420",  # NAVER
    "207940",  # 삼성바이오로직스
]


def kis_base() -> str:
    env_mode = os.environ.get("KIS_ENV", "mock").lower()
    if env_mode == "real":
        return "https://openapi.koreainvestment.com:9443"
    return "https://openapivts.koreainvestment.com:29443"  # mock


def get_token() -> str:
    app_key = os.environ["KIS_APP_KEY"]
    app_secret = os.environ["KIS_APP_SECRET"]
    if not app_key or not app_secret:
        raise RuntimeError("KIS_APP_KEY / KIS_APP_SECRET not set in .env.local")
    r = requests.post(
        f"{kis_base()}/oauth2/tokenP",
        json={
            "grant_type": "client_credentials",
            "appkey": app_key,
            "appsecret": app_secret,
        },
        timeout=15,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def fetch_quote(token: str, ticker: str) -> dict[str, Any]:
    """현재가 시세 (PBR/PER 포함)."""
    headers = {
        "content-type": "application/json; charset=utf-8",
        "authorization": f"Bearer {token}",
        "appkey": os.environ["KIS_APP_KEY"],
        "appsecret": os.environ["KIS_APP_SECRET"],
        "tr_id": "FHKST01010100",  # 주식현재가 시세 — mock/real 동일
    }
    params = {
        "fid_cond_mrkt_div_code": "J",  # KRX
        "fid_input_iscd": ticker,
    }
    r = requests.get(
        f"{kis_base()}/uapi/domestic-stock/v1/quotations/inquire-price",
        headers=headers,
        params=params,
        timeout=15,
    )
    r.raise_for_status()
    return r.json().get("output", {})


def our_ratios(ticker: str) -> dict[str, Any]:
    """우리 DB 기반 PBR / PER / 현재가 / 시총."""
    e = get_engine()
    with e.connect() as c:
        latest_fin = c.execute(text(
            "select net_income, total_equity, equity_attributable_to_owners, eps "
            "from financials where ticker = :t and period_type = 'A' "
            "order by fiscal_year desc limit 1"
        ), {"t": ticker}).first()
        stk = c.execute(text(
            "select market_cap, shares_outstanding from stocks where ticker = :t"
        ), {"t": ticker}).first()
        last_price = c.execute(text(
            "select close from prices where ticker = :t "
            "order by date desc limit 1"
        ), {"t": ticker}).scalar()
    if not latest_fin or not stk:
        return {}
    mc = int(stk.market_cap) if stk.market_cap is not None else None
    # PBR 표준은 지배지분만. 미수집 시 전체 자본 폴백.
    eq_attr = (
        int(latest_fin.equity_attributable_to_owners)
        if latest_fin.equity_attributable_to_owners is not None else None
    )
    eq_total = int(latest_fin.total_equity) if latest_fin.total_equity is not None else None
    eq = eq_attr if eq_attr is not None else eq_total
    ni = int(latest_fin.net_income) if latest_fin.net_income is not None else None
    eps = float(latest_fin.eps) if latest_fin.eps is not None else None
    pbr = mc / eq if mc and eq and eq > 0 else None
    per = mc / ni if mc and ni and ni > 0 else None
    return {
        "price": float(last_price) if last_price else None,
        "market_cap": mc,
        "pbr": pbr,
        "per": per,
        "eps": eps,
        "equity": eq,
        "equity_source": "지배지분" if eq_attr is not None else "전체",
    }


def main() -> int:
    print(f"KIS env = {os.environ.get('KIS_ENV', 'mock')} | base = {kis_base()}\n")

    try:
        token = get_token()
    except Exception as e:
        print(f"❌ token error: {e}", file=sys.stderr)
        return 1
    print("✓ KIS access token issued\n")

    print(f"{'Ticker':<8} {'Source':<6} {'Price':>12} {'Marcap(억)':>14} {'PBR':>7} {'PER':>8} {'EPS':>10}")
    print("-" * 80)
    for ticker in SAMPLE_TICKERS:
        try:
            q = fetch_quote(token, ticker)
            kis_price = float(q.get("stck_prpr", 0)) if q.get("stck_prpr") else None
            kis_pbr = float(q.get("pbr")) if q.get("pbr") else None
            kis_per = float(q.get("per")) if q.get("per") else None
            kis_eps = float(q.get("eps")) if q.get("eps") else None
            kis_marcap = int(q.get("hts_avls", 0)) * 100_000_000 if q.get("hts_avls") else None  # KIS 단위: 억원
        except Exception as e:
            print(f"{ticker} KIS error: {e}", file=sys.stderr)
            continue
        ours = our_ratios(ticker)

        def fmt(v, w, p=2):
            if v is None:
                return "-".rjust(w)
            return f"{v:.{p}f}".rjust(w) if isinstance(v, float) else str(v).rjust(w)

        def f_marcap(v):
            return f"{int(v) / 100_000_000:>12,.0f}억" if v else "-"

        print(
            f"{ticker:<8} {'KIS':<6} {fmt(kis_price, 12, 0):>12} "
            f"{f_marcap(kis_marcap)} {fmt(kis_pbr, 7):>7} {fmt(kis_per, 8):>8} {fmt(kis_eps, 10, 0):>10}"
        )
        print(
            f"{'':<8} {'OURS':<6} {fmt(ours.get('price'), 12, 0):>12} "
            f"{f_marcap(ours.get('market_cap'))} {fmt(ours.get('pbr'), 7):>7} {fmt(ours.get('per'), 8):>8} {fmt(ours.get('eps'), 10, 0):>10}"
        )
        # 차이 백분율
        if kis_pbr and ours.get("pbr"):
            diff = (ours["pbr"] - kis_pbr) / kis_pbr * 100
            print(f"{'':<8} {'Δ%':<6} {'':>12} {'':>14} {diff:>+7.1f}%", end="")
        if kis_per and ours.get("per"):
            diff = (ours["per"] - kis_per) / kis_per * 100
            print(f" {diff:>+8.1f}%")
        else:
            print()
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
