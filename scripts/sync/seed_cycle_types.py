"""KOSPI 시총 상위 종목 수동 sector 매핑 — 사이클 인식 v1.

추후 OpenDART API로 자동 매핑 가능 (quota 리셋 후).
이건 가장 큰 영향 종목들만 즉시 분류.
"""
from __future__ import annotations
import sys
sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import text  # noqa: E402

from sync.db import get_engine  # noqa: E402

# (ticker, cycle_type) — 시총 큰 KOSPI 종목 위주
MAPPING: dict[str, str] = {
    # === 반도체 (cyclical with growth bias) ===
    "005930": "cyclical",  # 삼성전자
    "000660": "cyclical",  # SK하이닉스
    "042700": "growth",    # 한미반도체 (HBM 장비)
    "240810": "cyclical",  # 원익IPS
    "240560": "cyclical",  # 동운아나텍
    # === 자동차 ===
    "005380": "cyclical",  # 현대차
    "000270": "cyclical",  # 기아
    "012330": "cyclical",  # 현대모비스
    "204320": "cyclical",  # HL만도
    # === 화학/소재 ===
    "051910": "cyclical",  # LG화학
    "011170": "cyclical",  # 롯데케미칼
    "010950": "cyclical",  # S-Oil
    "096770": "cyclical",  # SK이노베이션
    "298050": "cyclical",  # 효성첨단소재
    "003670": "cyclical",  # 포스코퓨처엠
    # === 철강/금속 ===
    "005490": "cyclical",  # POSCO홀딩스
    "004020": "cyclical",  # 현대제철
    "010130": "cyclical",  # 고려아연
    # === 조선/중공업 ===
    "329180": "cyclical",  # HD현대중공업
    "010140": "cyclical",  # 삼성중공업
    "042660": "cyclical",  # 한화오션
    "267250": "cyclical",  # HD현대
    # === 항공/운송 ===
    "003490": "cyclical",  # 대한항공
    "020560": "cyclical",  # 아시아나항공
    "180640": "cyclical",  # 한진칼
    # === 건설 ===
    "000720": "cyclical",  # 현대건설
    "047040": "cyclical",  # 대우건설
    "375500": "cyclical",  # DL이앤씨
    "028050": "cyclical",  # 삼성E&A
    # === 통신 (defensive) ===
    "030200": "defensive",  # KT
    "017670": "defensive",  # SKT
    "032640": "defensive",  # LG유플러스
    # === 유틸리티 (defensive) ===
    "015760": "defensive",  # 한국전력
    "036460": "defensive",  # 한국가스공사
    # === 식품/생활소비재 (defensive) ===
    "097950": "defensive",  # CJ제일제당
    "004370": "defensive",  # 농심
    "271560": "defensive",  # 오리온
    "271940": "defensive",  # 일동홀딩스
    "001680": "defensive",  # 대상
    "035250": "defensive",  # 강원랜드
    "003920": "defensive",  # 남양유업
    "002270": "defensive",  # 롯데푸드
    # === 헬스케어/바이오 (growth) ===
    "207940": "growth",   # 삼성바이오로직스
    "326030": "growth",   # SK바이오팜
    "068270": "growth",   # 셀트리온
    "086520": "growth",   # 에코프로 (배터리)
    # === IT/플랫폼 (growth) ===
    "035420": "growth",   # NAVER
    "035720": "growth",   # 카카오
    "003550": "growth",   # LG (지주, 다양 — 일단 growth)
    # === 금융 (financial) ===
    "105560": "financial",  # KB금융
    "055550": "financial",  # 신한지주
    "086790": "financial",  # 하나금융지주
    "316140": "financial",  # 우리금융지주
    "032830": "financial",  # 삼성생명
    "000810": "financial",  # 삼성화재
    "088350": "financial",  # 한화생명
    "138930": "financial",  # BNK금융지주
    # === 유통/리테일 (defensive 약하게) ===
    "004170": "defensive",  # 신세계
    "139480": "defensive",  # 이마트
    "023530": "defensive",  # 롯데쇼핑
}


def main() -> int:
    engine = get_engine()
    with engine.begin() as conn:
        n_total = 0
        for ticker, cycle in MAPPING.items():
            result = conn.execute(text(
                "update stocks set cycle_type = :ct where ticker = :t"
            ), {"ct": cycle, "t": ticker})
            n_total += result.rowcount or 0

        # 통계
        rows = conn.execute(text(
            "select cycle_type, count(*) n from stocks where market='KOSPI' group by cycle_type order by n desc"
        )).all()
        print(f"updated: {n_total} rows")
        print("KOSPI cycle_type 분포:")
        for r in rows:
            print(f"  {r.cycle_type}: {r.n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
