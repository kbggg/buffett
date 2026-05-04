# Buffett — 가치투자 종목 추천 시스템

워렌 버핏 가치투자 원칙으로 한국(KOSPI) 우량 저평가 종목을 추리는 개인용 의사결정 도구.

## 로컬 개발

```bash
# Node 24 + pnpm
nvm use 24
pnpm install
pnpm dev          # http://localhost:3000

# Python 데이터 sync (uv 필요)
cd scripts
uv sync
uv run python -m sync.stocks --all                    # 종목 마스터
uv run python -m sync.financials --all --markets KOSPI  # 재무
uv run python -m sync.prices --all                    # 가격
uv run python -m analysis.runner                      # 점수 산출
uv run python -m analysis.backtest --save             # 백테스트
```

## Vercel 배포

1. **vercel.com → New Project → GitHub repo `kbggg/buffett` 연결**
2. **Environment Variables 등록**:
   - `DATABASE_URL` ← Supabase Transaction pooler (6543)
   - 그 외는 데이터 sync용이라 Vercel엔 불필요 (sync는 GH Actions로)
3. **Build Settings**: 자동 (Next.js 16 기본값)
4. **Deploy** 클릭

### Vercel에서 동작하는 것 / 안 하는 것

| 기능 | Vercel | 이유 |
|---|---|---|
| Today / Stock Detail / Portfolio / What If / 결정 로그 | ✅ | 읽기만 함 |
| 매수/매도/결정 기록 | ✅ | DB 쓰기만 함 |
| 백테스트 새로 실행 | ❌ | Python spawn 필요 — 로컬에서 실행 후 결과 자동 표시 |
| 데이터 sync (financials/prices/events) | ❌ | GH Actions cron이 처리 (별도 환경) |

## GitHub Actions 자동 sync

매일 새벽 5시 KST 자동 실행. Secrets 필요:
- `DATABASE_URL_DIRECT` (Session pooler 5432)
- `OPENDART_API_KEY`

## 구조

```
src/                     # Next.js 16 App Router (UI + API)
  app/
    page.tsx             # Today
    stock/[ticker]/      # Stock Detail
    portfolio/           # 보유 추적
    whatif/              # What If 백테스트
    decisions/           # 결정 로그
    api/                 # POST/GET endpoints
  lib/queries.ts         # Drizzle 쿼리
  components/            # UI 컴포넌트
  db/schema.ts           # Drizzle 스키마
scripts/                 # Python 데이터 + 분석
  sync/                  # 데이터 수집 (FDR + OpenDART)
  analysis/              # Buffett Score, 내재가치, 백테스트
.github/workflows/sync.yml  # 일별 자동 sync
```

## 핵심 결정사항

상세는 [CLAUDE.md](./CLAUDE.md) 참조.
