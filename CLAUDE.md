# Buffett — 가치투자 종목 추천 시스템

이 문서는 프로젝트의 모든 핵심 결정사항을 담고 있습니다. Claude Code는 작업 시작 전 반드시 이 문서를 읽으세요.

---

## 프로젝트 정체성

**한 문장 정의**: 워렌 버핏의 가치투자 원칙으로 한국 시장(KOSPI/KOSDAQ)의 우량 저평가 종목을 추리고, 진입 타이밍이 좋을 때 알려주는 개인용 의사결정 도구.

**최종 사용자**: 본인 1명 (개발자, 프론트엔드 백그라운드, 재무제표 용어는 잘 모름)

**의도적으로 안 하는 것** (스코프 방어):
- 자동매매 (절대 안 함, 시그널만)
- 단기 차트 매매 / 데이트레이딩
- 충동 매수 유도 알림
- 수익률 자랑 / 공유 기능
- 다른 사람도 쓰는 멀티 유저 시스템

---

## 투자 철학 (시스템의 영혼)

길 C 전략을 따른다:
1. **종목 풀**: 버핏 원칙으로 한국 시장 약 2,500개 중 30~80개 우량주만 추림
2. **내재가치**: 풀 안 종목의 적정 가치를 3가지 방법으로 계산 (DCF, Owner Earnings, Graham)
3. **안전마진**: 현재가가 내재가치의 70% 이하일 때만 매수 후보
4. **진입 타이밍**: 안전마진 충족 종목 중 기술적 신호가 좋은 시점에만 알림

**보유 기간**: 중장기 (수개월~수년). 단기매매 안 함.
**기대 수익**: 연 8~12% (KOSPI 대비 +3~5%p 초과 목표). 단기 3% 같은 비현실적 목표 X.

---

## 기술 스택 (확정)

```
Frontend:    Next.js 16 (App Router) + TypeScript + Tailwind
             shadcn/ui, Recharts (재무 차트), Lightweight Charts (가격)
             TanStack Query

Backend:     Next.js API Routes (별도 서버 X)
             Drizzle ORM
             postgres-js

DB:          Supabase PostgreSQL (싱가포르 리전, ap-southeast-1)
             ★ Pooler 사용 필수 (Direct는 IPv6 전용이라 안 됨)
             - Transaction pooler (6543): Next.js/Vercel용
             - Session pooler (5432): Python 마이그레이션용

데이터 수집:  Python 3.14 (uv 패키지 매니저)
             OpenDartReader, FinanceDataReader, pykrx
             SQLAlchemy + psycopg[binary] (psycopg3)

자동화:      GitHub Actions cron (매일 새벽 5시 KST)

배포:        Vercel (프론트, 무료) + Supabase (DB, 무료)
             도메인 추후 추가

증권사:      한국투자증권 KIS Developers API
             - 모의투자 API 먼저 사용 (검증용)
             - 실전 잔고 조회 (포트폴리오 동기화)
             - 실전 주문 API는 사용 안 함 (자동매매 안 함)
```

---

## UX 핵심 원칙

**계층형 정보 공개 (Progressive Disclosure)**

사용자는 재무제표 용어 모름. 모든 화면이 다음 4계층으로 구성:

```
계층 1 (항상 보임): 점수, 할인율, 한 줄 요약, 코스피 대비 성과
계층 2 (1번 클릭): 항목별 일상어 설명 ("돈 잘 벌고 있음", "빚이 적음")
계층 3 (2번 클릭): 정확한 수치 + 계산 근거
계층 4 (용어 클릭): 용어 정의 + 왜 중요한가 + 예시
```

**번역 원칙**: 모든 재무 지표는 일상어로 변환되어 표시.
- "ROE 12%" → "주주 돈 100원으로 매년 12원 벌고 있음"
- "PER 8" → "지금 가격으로 8년이면 본전 (낮을수록 쌈)"
- "안전마진 35%" → "적정 가치 대비 35% 할인된 가격"

---

## 화면 구조 (4개)

1. **Today** — 오늘 살 만한 종목 (3중 통과: Buffett Score + 안전마진 + 타이밍)
2. **Stock Detail** — 한 종목 5분 안에 평가 가능. 계층형 펼치기.
3. **What If** — 과거 시점에 시스템 따랐다면 결과는? (가장 차별화되는 기능)
4. **Portfolio** — 보유 추적, 매도 신호, 결정 로그

---

## 데이터 모델 (Drizzle, PostgreSQL)

`src/db/schema.ts`에 정의. 핵심 테이블:

- `stocks` — 종목 마스터 (KOSPI/KOSDAQ + corp_code 매핑)
- `financials` — 분기/연간 재무제표 (★ `report_date` 필드가 백테스트 핵심)
- `prices` — 일별 OHLCV
- `scores` — 계산된 점수 (Buffett, 내재가치, 타이밍)
- `portfolio` — 보유 종목
- `decisions` — 매수/매도/관망 결정 로그 (학습 자산)
- `sync_logs` — 데이터 동기화 이력

**중요한 설계 포인트**:
- `report_date`: 재무 정보가 실제로 시장에 알려진 날짜. 백테스트에서 look-ahead bias 방지에 필수.
- `is_preferred`: 우선주 표시. 분석 대상에서 제외.
- `decisions`: 본인이 안 산 종목/산 종목을 1년 후 돌아보기 위한 학습 데이터.

---

## 단계별 로드맵

```
[Phase 1] 데이터 파이프라인 ← 현재 여기
   - Supabase + Drizzle 스키마
   - OpenDART 재무, FDR 가격, KIS 보조
   - GitHub Actions로 매일 갱신

[Phase 2] 분석 엔진
   - Buffett Score 계산 (가중치 결정)
   - 내재가치 3종 계산
   - 안전마진 산출
   - 타이밍 신호 (52주 위치, RSI, 이평선)

[Phase 3] UI
   - Today, Stock Detail, Portfolio
   - 계층형 정보 공개 적용
   - 용어 번역 사전

[Phase 4] What If 엔진 (백테스트)
   - 거래비용 0.4% 반영
   - look-ahead bias 방지
   - 생존자 편향 회피

[Phase 5] 모의투자 운영 (3~6개월)
   - KIS 모의투자 API
   - 매주 시그널대로 매매 기록
   - 결과 누적 분석

[Phase 6] AWS/Vercel 배포 (이미 Supabase 쓰니 부분 완료)

[Phase 7] 소액 실전 (조건부)
   - Phase 5에서 KOSPI 의미있게 초과 시에만
   - 100만원부터, 점진적 증액
```

---

## 절대 위반 금지 원칙

1. **자동매매 코드 작성 금지.** KIS 주문 API는 모의투자 환경에서만 사용.
2. **본인이 이해 못 한 코드는 절대 production에 안 올림.** 모르면 Claude에게 물어볼 것.
3. **6개월 모의투자 통과 전엔 실전 자본 투입 금지.**
4. **백테스트 결과를 절대 과신하지 않음.** 거래비용/슬리피지/생존자편향 반영 필수.
5. **API 키, 비밀번호 절대 git에 커밋 금지.** `.env.local`, `scripts/.env`는 `.gitignore`.

---

## 환경변수 (실제 값은 .env.local에)

```bash
# Supabase (Pooler 사용, Direct 안 씀)
DATABASE_URL=postgresql://postgres.[ref]:[pw]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres
DATABASE_URL_DIRECT=postgresql://postgres.[ref]:[pw]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://[ref].supabase.co
# 새 Supabase API 키 (2025~). 레거시 anon/service_role JWT 대체.
# publishable = 브라우저 노출 OK / secret = 서버 전용
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...

# 데이터 소스
OPENDART_API_KEY=...

# 한국투자증권
KIS_APP_KEY=...
KIS_APP_SECRET=...
KIS_ACCOUNT_NO=...
KIS_ENV=mock  # 'mock' | 'real'
```

---

## 프로젝트 구조 (목표)

```
buffett/
├── CLAUDE.md                   # 이 파일
├── README.md
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── .env.local                  # gitignore
├── .gitignore
│
├── src/
│   ├── app/                    # Next.js App Router
│   ├── components/
│   ├── db/
│   │   ├── schema.ts
│   │   ├── client.ts
│   │   └── migrations/
│   └── lib/
│
├── scripts/                    # Python 데이터 수집
│   ├── pyproject.toml
│   ├── .env                    # gitignore
│   ├── sync/
│   │   ├── stocks.py
│   │   ├── financials.py
│   │   ├── prices.py
│   │   └── db.py
│   └── run_sync.py
│
└── .github/workflows/
    └── sync.yml                # 매일 cron
```

---

## Claude Code 작업 시 지침

1. **이 문서를 먼저 읽고 시작하세요.** 모든 결정의 근거가 여기 있습니다.
2. **확실하지 않으면 본인에게 물으세요.** 임의 결정 금지.
3. **금융 관련 가정은 특히 조심.** "이 종목이 좋아 보인다" 같은 판단 절대 코드에 넣지 말 것. 객관적 지표만.
4. **에러는 숨기지 말고 노출.** 데이터 오류는 잘못된 투자 결정으로 직결.
5. **테스트는 작은 단위부터.** 2,500종목 처음부터 돌리지 말고 2~3종목으로 검증.

---

## 현재 진행 상황 (2026-05-03 기준)

- [x] 한국투자증권 계좌 개설
- [x] KIS Developers API 키 발급
- [x] OpenDART API 키 발급
- [x] Supabase 프로젝트 생성
- [x] GitHub 저장소 생성 + 로컬 클론
- [x] Next.js 프로젝트 부트스트랩 (Next.js 16.2.4 + React 19 + TS + Tailwind 4)
- [x] DB 스키마 작성 (`src/db/schema.ts`, 7 tables) + 초기 마이그레이션 SQL 생성
- [x] Supabase 마이그레이션 적용 (7 tables + 6 enums in `public` schema)
- [x] Python 3.14 + uv 환경 부트스트랩 (`scripts/pyproject.toml`)
- [x] 종목 마스터 수집 — FDR 기반, KOSPI 949 + KOSDAQ 1,823 = 2,772종목 동기화
- [x] OpenDART corp_code 매핑 — 2,659개 매칭 (96%, 누락은 거의 전부 우선주)
- [x] 가격 데이터 수집 — 2,772종목 × 5년치 = 3,056,540행 (FDR)
- [x] 재무 모듈 검증 (12개 업종 다양성 + 매핑 robustness)
- [x] 재무제표 Y2025 + Y2024 backfill 완료 (2,646 + 2,551 종목, ~21k rows)
- [x] **Phase 2 분석 엔진 완성**: Buffett Score (100점) + 내재가치 3종 + 안전마진 + 타이밍 신호 (52w/RSI/MA200)
- [x] **분석 스코프**: KOSPI 한정 (KOSDAQ 거래량 부족으로 제외)
- [ ] Y2023~Y2021 KOSPI backfill (~10k calls, 1일 안에 완료) ← 내일
- [ ] commit/push + GitHub Actions cron 가동 검증 ← 내일
- [ ] Phase 3 UI 시작 (Today 화면)

---

## 참고: 처음부터 지금까지의 결정 흐름

1. 처음에 "버핏 원칙으로 단기 3% 수익" → 모순 지적, 길 C로 변경
2. "단기 매매" → "중장기 가치투자 + 진입 타이밍"으로 확정
3. "자동매매 포함" → 위험성 인지 후 제거
4. "AWS에 올림" → Vercel + Supabase로 변경 (자동매매 빠지면서 단순화)
5. "토스증권 자동화" → 공식 API 없어서 한국투자증권으로 메인 변경
6. "재무 용어 모름" → 계층형 UX + 용어 번역 사전 도입
7. "What If 기능 추가" → 과거 시뮬레이션이 핵심 기능 중 하나
