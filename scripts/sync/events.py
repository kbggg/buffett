"""최근 3개월 이벤트 수집 — DART 공시, 임원 지분 변동, 거래량 급변.

스코프: 매수후보 + 가치통과 종목만 (Buffett Score >= 80 + MoS >= 30%).
~80개 종목 × 3 데이터 소스 = 가벼운 워크로드.

이벤트 분류 규칙 (간단, 키워드 매칭):
- positive: 자기주식 취득(완료/결정), 무상증자, 임원 매수
- negative: 횡령/배임, 소송, 관리종목지정, 회계처리위반, 임원 매도
- info: 분기/반기/사업보고서, 정관변경, 이사회 일반
- neutral: 그 외

CLAUDE.md 원칙: 이건 "위험 알림" 용도. 매수 결정 강화가 아니라 가치 분석 위에 덧입히는 위험/기회 신호.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

import OpenDartReader  # noqa: E402
import pandas as pd  # noqa: E402
from sqlalchemy import text  # noqa: E402

from sync import env  # noqa: F401, E402
from sync.db import get_engine  # noqa: E402

# 키워드 → (event_type, category)
NEG_KEYWORDS = [
    ("횡령", "negative"),
    ("배임", "negative"),
    ("소송", "negative"),
    ("관리종목지정", "negative"),
    ("회계처리기준", "negative"),
    ("불성실공시", "negative"),
    ("거래정지", "negative"),
    ("상장폐지", "negative"),
]
POS_KEYWORDS = [
    ("자기주식취득결정", "positive"),
    ("자기주식취득결과", "positive"),
    ("무상증자결정", "positive"),
    ("현금배당결정", "positive"),
    ("주식분할결정", "positive"),
]
INFO_KEYWORDS = [
    ("사업보고서", "info"),
    ("반기보고서", "info"),
    ("분기보고서", "info"),
]
NEUTRAL_DEFAULT = "neutral"


def classify(report_nm: str) -> str:
    for kw, cat in NEG_KEYWORDS:
        if kw in report_nm:
            return cat
    for kw, cat in POS_KEYWORDS:
        if kw in report_nm:
            return cat
    for kw, cat in INFO_KEYWORDS:
        if kw in report_nm:
            return cat
    return NEUTRAL_DEFAULT


@dataclass(frozen=True)
class Event:
    ticker: str
    event_date: date
    event_type: str  # 'disclosure', 'insider_trade', 'volume_spike'
    category: str  # 'positive', 'negative', 'neutral', 'info'
    title: str
    summary: str | None
    source: str
    raw_url: str | None
    raw_data: dict | None


# === DART 공시 ===

def fetch_disclosures(
    dart: OpenDartReader, ticker: str, corp_code: str, start: date, end: date
) -> list[Event]:
    """OpenDartReader.list 로 회사 공시 목록 조회."""
    try:
        df = dart.list(corp=corp_code, start=start.isoformat(), end=end.isoformat())
    except Exception:
        return []
    if df is None or df.empty:
        return []
    out: list[Event] = []
    for _, r in df.iterrows():
        report_nm = str(r.get("report_nm", "")).strip()
        if not report_nm:
            continue
        rcept_no = str(r.get("rcept_no", "")).strip() or None
        rcept_dt = str(r.get("rcept_dt", "")).strip()
        try:
            ev_date = date(int(rcept_dt[:4]), int(rcept_dt[4:6]), int(rcept_dt[6:8]))
        except (ValueError, IndexError):
            continue
        out.append(
            Event(
                ticker=ticker,
                event_date=ev_date,
                event_type="disclosure",
                category=classify(report_nm),
                title=report_nm,
                summary=str(r.get("flr_nm", "") or "") or None,
                source="DART",
                raw_url=(
                    f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={rcept_no}"
                    if rcept_no else None
                ),
                raw_data={"rcept_no": rcept_no, "report_nm": report_nm},
            )
        )
    return out


# === 임원 지분 변동 ===

def fetch_insider(
    dart: OpenDartReader, ticker: str, corp_code: str, start: date, end: date
) -> list[Event]:
    """임원·주요주주 특정증권등 소유상황보고서. OpenDartReader.report 사용."""
    try:
        # 'majorstock' = 대량보유, 'elestock' = 임원소유
        df = dart.report(corp_code, "elestock", start.year)
    except Exception:
        return []
    if df is None or df.empty:
        return []
    out: list[Event] = []
    for _, r in df.iterrows():
        rcept_dt_str = str(r.get("rcept_dt") or "").strip()
        try:
            ev_date = date(int(rcept_dt_str[:4]), int(rcept_dt_str[4:6]), int(rcept_dt_str[6:8]))
        except (ValueError, IndexError):
            continue
        if ev_date < start or ev_date > end:
            continue
        change_amount = r.get("stkqy_irds")  # 증감 수량 (음수=매도, 양수=매수)
        try:
            change_n = int(str(change_amount).replace(",", "")) if change_amount else 0
        except ValueError:
            change_n = 0
        cat = "positive" if change_n > 0 else ("negative" if change_n < 0 else "info")
        title = (
            f"임원지분 변동: "
            f"{r.get('repror') or '-'} {('+' if change_n > 0 else '')}{change_n:,}주"
        )
        out.append(
            Event(
                ticker=ticker,
                event_date=ev_date,
                event_type="insider_trade",
                category=cat,
                title=title,
                summary=f"보고자: {r.get('repror')} / 사유: {r.get('chg_rsn') or '-'}",
                source="DART",
                raw_url=None,
                raw_data={"raw": {k: str(v) for k, v in r.items()}},
            )
        )
    return out


# === 거래량 급변 ===

VOLUME_SPIKE_MULTIPLIER = 3.0  # 3개월 평균 대비 N배 이상이면 spike


def fetch_volume_spikes(
    conn, ticker: str, start: date, end: date
) -> list[Event]:
    rows = conn.execute(text(
        """
        with recent as (
          select date, volume,
                 avg(volume) over (order by date rows between 60 preceding and 1 preceding) as avg60
          from prices
          where ticker = :t and date <= :end
          order by date desc limit 90
        )
        select date, volume, avg60
        from recent
        where date >= :start and avg60 > 0 and volume::numeric > avg60 * :mult
        order by date desc
        """
    ), {"t": ticker, "start": start, "end": end, "mult": VOLUME_SPIKE_MULTIPLIER}).all()
    out: list[Event] = []
    for r in rows:
        ratio = float(r.volume) / float(r.avg60) if r.avg60 else 0
        out.append(
            Event(
                ticker=ticker,
                event_date=r.date,
                event_type="volume_spike",
                category="info",  # 호재인지 악재인지 모름 — 그냥 정보
                title=f"거래량 급증: 60일 평균의 {ratio:.1f}배",
                summary=f"당일 거래량 {int(r.volume):,} / 60일 평균 {int(r.avg60):,}",
                source="computed",
                raw_url=None,
                raw_data={"volume": int(r.volume), "avg60": int(r.avg60), "ratio": round(ratio, 2)},
            )
        )
    return out


# === 적재 ===

_UPSERT_SQL = text(
    """
    insert into events (
      ticker, event_date, event_type, category, title, summary,
      source, raw_url, raw_data, fetched_at
    ) values (
      :ticker, :event_date, :event_type, :category, :title, :summary,
      :source, :raw_url, cast(:raw_data as jsonb), now()
    )
    on conflict (ticker, event_date, event_type, title) do update set
      category = excluded.category,
      summary = excluded.summary,
      raw_data = excluded.raw_data,
      fetched_at = now()
    """
)


def upsert(events: Iterable[Event]) -> int:
    import json
    engine = get_engine()
    rows = list(events)
    if not rows:
        return 0
    payload = [
        {
            "ticker": e.ticker,
            "event_date": e.event_date,
            "event_type": e.event_type,
            "category": e.category,
            "title": e.title[:1000],  # text 컬럼이지만 안전장치
            "summary": (e.summary or None),
            "source": e.source,
            "raw_url": e.raw_url,
            "raw_data": json.dumps(e.raw_data, ensure_ascii=False) if e.raw_data else None,
        }
        for e in rows
    ]
    with engine.begin() as conn:
        conn.execute(_UPSERT_SQL, payload)
    return len(rows)


# === Targets ===

def list_event_targets(conn, calc_date: date | None = None) -> list[tuple[str, str]]:
    """매수후보 + 가치통과 (Score >= 80 AND MoS >= 30%)."""
    rows = conn.execute(text(
        """
        select sc.ticker, s.corp_code
        from scores sc join stocks s on s.ticker = sc.ticker
        where sc.calc_date = (select max(calc_date) from scores)
          and sc.buffett_score >= 80
          and sc.margin_of_safety >= 0.30
          and s.corp_code is not null
        order by sc.buffett_score desc
        """
    )).all()
    return [(r.ticker, r.corp_code) for r in rows]


def main() -> int:
    p = argparse.ArgumentParser(description="Sync recent events for buy-candidate stocks")
    p.add_argument("--ticker", action="append", help="specific ticker(s); default = candidates")
    p.add_argument("--days", type=int, default=90, help="days back (default 90)")
    p.add_argument("--sleep", type=float, default=0.05, help="seconds between API calls")
    args = p.parse_args()

    api_key = os.environ.get("OPENDART_API_KEY")
    if not api_key:
        print("OPENDART_API_KEY missing", file=sys.stderr)
        return 2
    dart = OpenDartReader(api_key)

    end = date.today()
    start = end - timedelta(days=args.days)

    engine = get_engine()
    with engine.connect() as conn:
        if args.ticker:
            stk_rows = conn.execute(
                text("select ticker, corp_code from stocks where ticker = ANY(:t) and corp_code is not null"),
                {"t": args.ticker},
            ).all()
            targets = [(r.ticker, r.corp_code) for r in stk_rows]
        else:
            targets = list_event_targets(conn)

    print(f"[events] window: {start} → {end} | {len(targets)} targets")

    total = 0
    fails: list[str] = []
    t0 = time.time()
    for i, (ticker, corp_code) in enumerate(targets, 1):
        try:
            events: list[Event] = []
            events.extend(fetch_disclosures(dart, ticker, corp_code, start, end))
            if args.sleep > 0:
                time.sleep(args.sleep)
            events.extend(fetch_insider(dart, ticker, corp_code, start, end))
            if args.sleep > 0:
                time.sleep(args.sleep)
            with engine.connect() as conn:
                events.extend(fetch_volume_spikes(conn, ticker, start, end))
            n = upsert(events)
            total += n
            print(f"  [{i:>3}/{len(targets)}] {ticker}: +{n} events (cum {total})")
        except Exception as e:
            fails.append(f"{ticker}: {repr(e)[:120]}")
            print(f"  ! {ticker}: {repr(e)[:120]}", file=sys.stderr)

    print(f"\n[events] done: {total} events in {time.time() - t0:.0f}s")
    if fails:
        print(f"[events] failures: {len(fails)}")
        for f in fails[:5]:
            print(f"  - {f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
