"""OpenDART company 정보로 sector / cycle_type 자동 매핑.

OpenDartReader.company(corp_code) 응답:
- induty_code: KSIC 업종 코드 (8자리)
- induty: 업종 설명 (한글)

KSIC → cycle_type 매핑:
- 반도체/자동차/화학/철강/정유/항공/건설/조선/금속 → cyclical
- 통신/유틸리티/식품/생활소비재/제약 → defensive
- IT 서비스/소프트웨어/바이오/게임 → growth
- 은행/보험/증권 → financial
"""
from __future__ import annotations
import argparse, os, sys, time
sys.stdout.reconfigure(encoding="utf-8")

import OpenDartReader  # noqa: E402
from sqlalchemy import text  # noqa: E402

from sync import env  # noqa: F401, E402
from sync.db import get_engine  # noqa: E402

# KSIC (한국표준산업분류) 2-digit prefix → cycle_type
# 출처: 통계청 KSIC. OpenDART의 induty_code 가 KSIC.
KSIC_PREFIX_MAP: dict[str, str] = {
    # 제조업 = cyclical (사이클)
    "10": "defensive",  # 식료품
    "11": "defensive",  # 음료
    "13": "cyclical",   # 섬유
    "14": "cyclical",   # 의복
    "15": "cyclical",   # 가죽·신발
    "16": "cyclical",   # 목재
    "17": "cyclical",   # 펄프·종이
    "18": "cyclical",   # 인쇄
    "19": "cyclical",   # 코크스·정유
    "20": "cyclical",   # 화학
    "21": "growth",     # 의약품
    "22": "cyclical",   # 고무·플라스틱
    "23": "cyclical",   # 비금속광물
    "24": "cyclical",   # 1차 금속(철강)
    "25": "cyclical",   # 금속가공
    "26": "cyclical",   # 전자(반도체/디스플레이/통신장비)
    "27": "growth",     # 의료·정밀·광학기기
    "28": "cyclical",   # 전기장비
    "29": "cyclical",   # 기계·장비
    "30": "cyclical",   # 자동차/조선/기타운송장비
    "31": "cyclical",   # 가구
    "32": "cyclical",   # 기타 제조

    # 광업/농어업
    "01": "defensive", "02": "cyclical", "03": "cyclical",  # 농임어업
    "05": "cyclical", "06": "cyclical", "07": "cyclical", "08": "cyclical",  # 광업

    # 전기·가스·수도 = defensive
    "35": "defensive",
    "36": "defensive", "37": "defensive", "38": "defensive", "39": "defensive",

    # 건설 = cyclical
    "41": "cyclical", "42": "cyclical",

    # 도소매·운송
    "45": "cyclical",   # 도매·자동차판매
    "46": "cyclical",   # 도매
    "47": "defensive",  # 소매
    "49": "cyclical",   # 육상운송
    "50": "cyclical",   # 수상운송 (해운)
    "51": "cyclical",   # 항공
    "52": "cyclical",   # 창고·운송지원

    # 숙박·음식
    "55": "defensive", "56": "defensive",

    # 정보·통신·미디어
    "58": "growth",     # 출판
    "59": "growth",     # 영상·오디오
    "60": "defensive",  # 방송
    "61": "defensive",  # 통신
    "62": "growth",     # 컴퓨터프로그래밍·시스템
    "63": "growth",     # 정보서비스 (포털 등)

    # 금융
    "64": "financial",  # 금융
    "65": "financial",  # 보험
    "66": "financial",  # 금융지원

    # 부동산·임대
    "68": "cyclical",   # 부동산
    "69": "cyclical",

    # 사업·전문서비스
    "70": "defensive", "71": "defensive", "72": "defensive", "73": "defensive",
    "74": "defensive", "75": "defensive",

    # 공공·교육·보건
    "84": "defensive", "85": "defensive",
    "86": "growth",   # 보건의료
    "87": "defensive",
}


def classify_ksic(induty_code: str | None) -> str:
    """KSIC 코드 prefix로 cycle_type 매핑."""
    if not induty_code:
        return "unknown"
    prefix = str(induty_code).strip()[:2]
    return KSIC_PREFIX_MAP.get(prefix, "unknown")


# 업종명 키워드 → cycle_type (induty_code가 없는 케이스용 폴백, 더 이상 사용 안 함)
KEYWORD_MAP: list[tuple[str, str]] = [
    # cyclical (사이클)
    ("반도체", "cyclical"),
    ("디스플레이", "cyclical"),
    ("전자부품", "cyclical"),
    ("자동차", "cyclical"),
    ("자동차부품", "cyclical"),
    ("화학", "cyclical"),
    ("석유", "cyclical"),
    ("정유", "cyclical"),
    ("철강", "cyclical"),
    ("금속", "cyclical"),
    ("조선", "cyclical"),
    ("선박", "cyclical"),
    ("기계", "cyclical"),
    ("건설", "cyclical"),
    ("건축자재", "cyclical"),
    ("부동산", "cyclical"),
    ("운수", "cyclical"),
    ("항공", "cyclical"),
    ("해운", "cyclical"),
    ("종합상사", "cyclical"),
    ("도매", "cyclical"),

    # financial
    ("은행", "financial"),
    ("금융", "financial"),
    ("보험", "financial"),
    ("생명보험", "financial"),
    ("손해보험", "financial"),
    ("증권", "financial"),
    ("투자", "financial"),
    ("자산운용", "financial"),

    # growth
    ("바이오", "growth"),
    ("의약품", "growth"),
    ("제약", "growth"),  # 제약은 defensive로도 볼 수 있지만 한국 시장에선 growth 패턴
    ("의료기기", "growth"),
    ("소프트웨어", "growth"),
    ("정보서비스", "growth"),
    ("게임", "growth"),
    ("인터넷", "growth"),
    ("플랫폼", "growth"),
    ("미디어", "growth"),
    ("엔터테인먼트", "growth"),
    ("2차전지", "growth"),
    ("배터리", "growth"),

    # defensive
    ("통신", "defensive"),
    ("전기", "defensive"),
    ("가스", "defensive"),
    ("수도", "defensive"),
    ("식품", "defensive"),
    ("음료", "defensive"),
    ("담배", "defensive"),
    ("주류", "defensive"),
    ("화장품", "defensive"),
    ("생활용품", "defensive"),
    ("유통", "defensive"),  # 약하게
    ("백화점", "defensive"),
    ("교육", "defensive"),
]


def classify(induty: str) -> str:
    """업종명 → cycle_type. 매칭 안 되면 'unknown'."""
    if not induty:
        return "unknown"
    for kw, ct in KEYWORD_MAP:
        if kw in induty:
            return ct
    return "unknown"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--markets", default="KOSPI", help="comma-separated (default KOSPI)")
    p.add_argument("--limit", type=int, default=None, help="limit number of stocks (test)")
    p.add_argument("--sleep", type=float, default=0.05, help="seconds between calls")
    p.add_argument("--only-unknown", action="store_true", help="skip stocks already classified")
    args = p.parse_args()

    api_key = os.environ.get("OPENDART_API_KEY")
    if not api_key:
        print("OPENDART_API_KEY not set", file=sys.stderr); return 2
    dart = OpenDartReader(api_key)

    markets = [m.strip().upper() for m in args.markets.split(",")]

    engine = get_engine()
    with engine.connect() as conn:
        placeholders = ",".join(f":m{i}" for i in range(len(markets)))
        sql = f"""
            select ticker, corp_code, name, sector, cycle_type
            from stocks
            where corp_code is not null and not is_preferred
              and market in ({placeholders})
        """
        if args.only_unknown:
            sql += " and cycle_type = 'unknown'"
        sql += " order by ticker"
        params = {f"m{i}": m for i, m in enumerate(markets)}
        rows = conn.execute(text(sql), params).all()

    if args.limit:
        rows = rows[: args.limit]
    print(f"[sector] targets: {len(rows)} (only_unknown={args.only_unknown})")

    counts: dict[str, int] = {"cyclical": 0, "defensive": 0, "growth": 0, "financial": 0, "unknown": 0}
    fails = 0
    t0 = time.time()
    for i, r in enumerate(rows, 1):
        try:
            info = dart.company(r.corp_code)
            if not isinstance(info, dict) or info.get("status") not in (None, "000"):
                fails += 1
                continue
            induty_code = str(info.get("induty_code") or "").strip()
            ct = classify_ksic(induty_code)
            counts[ct] += 1
            sector_label = f"KSIC {induty_code}" if induty_code else None
            with engine.begin() as conn:
                conn.execute(text(
                    "update stocks set sector = :s, cycle_type = :ct where ticker = :t"
                ), {"s": sector_label, "ct": ct, "t": r.ticker})
            if i % 50 == 0 or i == len(rows):
                elapsed = time.time() - t0
                print(f"  [{i:>4}/{len(rows)}] {r.ticker} KSIC={induty_code or '-':<6} → {ct} | {elapsed:.0f}s")
        except Exception as e:
            fails += 1
            print(f"  ! {r.ticker}: {repr(e)[:80]}", file=sys.stderr)
        if args.sleep > 0:
            time.sleep(args.sleep)

    print(f"\n[sector] done in {time.time() - t0:.0f}s")
    print(f"  cyclical:  {counts['cyclical']}")
    print(f"  defensive: {counts['defensive']}")
    print(f"  growth:    {counts['growth']}")
    print(f"  financial: {counts['financial']}")
    print(f"  unknown:   {counts['unknown']}")
    print(f"  fails:     {fails}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
