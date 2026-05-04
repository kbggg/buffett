"""환경변수 로딩 단일 진입점.

scripts/.env 우선, 없는 값은 ../.env.local 에서 보충.
모듈 import 시 1회만 실행.
"""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
_SCRIPTS_DIR = _HERE.parent
_REPO_ROOT = _SCRIPTS_DIR.parent

load_dotenv(_SCRIPTS_DIR / ".env", override=False)
load_dotenv(_REPO_ROOT / ".env.local", override=False)
