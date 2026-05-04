"""DB 연결 헬퍼.

`.env`(scripts/) 또는 `.env.local`(repo root) 어느 쪽이든 DATABASE_URL이 있으면 사용.
Drizzle 마이그레이션과 같은 Session pooler URL을 쓴다.
psycopg3 + SQLAlchemy 2.x 사용.
"""

from __future__ import annotations

import os
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from sync import env  # noqa: F401  -- 환경변수 로딩 사이드이펙트


def _resolve_db_url() -> str:
    # Python 데이터 스크립트는 장기 연결 + 배치 작업이라 Session pooler(5432)가 적합.
    # Transaction pooler(6543)는 psycopg3 호환 옵션이 추가로 필요하고 prepared statement도 제한.
    # 따라서 DATABASE_URL_DIRECT 를 우선 사용. 없으면 DATABASE_URL 폴백.
    url: Optional[str] = os.getenv("DATABASE_URL_DIRECT") or os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DB URL not found. Set DATABASE_URL_DIRECT in .env.local (Session pooler, port 5432)."
        )
    # postgres-js 전용 query param 제거 (psycopg3가 인식 못 함)
    if "?" in url:
        base, _, qs = url.partition("?")
        kept = [p for p in qs.split("&") if not p.startswith("pgbouncer=")]
        url = base + ("?" + "&".join(kept) if kept else "")
    # SQLAlchemy 2.x 는 psycopg3 다이얼렉트를 명시해야 함
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


# Supabase Session pooler는 동시 connection 15개 제한. 매 호출마다 Engine을 새로
# 만들면 connection이 누적되어 빠르게 한도 초과 → EMAXCONNSESSION 에러.
# 모듈 레벨 싱글톤으로 캐시하고 풀 크기도 보수적으로 제한.
_ENGINE: Engine | None = None


def get_engine() -> Engine:
    global _ENGINE
    if _ENGINE is None:
        _ENGINE = create_engine(
            _resolve_db_url(),
            pool_pre_ping=True,
            pool_size=3,
            max_overflow=2,
            pool_recycle=300,  # 5분 idle 후 재생성 (pooler가 끊을 가능성 대비)
            future=True,
        )
    return _ENGINE


def dispose_engine() -> None:
    """장기 스크립트가 종료 직전에 호출하면 Pooler에 connection을 빠르게 반납."""
    global _ENGINE
    if _ENGINE is not None:
        _ENGINE.dispose()
        _ENGINE = None
