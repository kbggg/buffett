import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const marketEnum = pgEnum("market", ["KOSPI", "KOSDAQ"]);
export const periodTypeEnum = pgEnum("period_type", ["Q", "A"]);
export const timingSignalEnum = pgEnum("timing_signal", [
  "BUY",
  "WATCH",
  "NEUTRAL",
]);
export const decisionEnum = pgEnum("decision", ["BUY", "SELL", "WATCH", "SKIP"]);
export const syncTypeEnum = pgEnum("sync_type", [
  "stocks",
  "financials",
  "prices",
  "scores",
  "events",
]);
export const syncStatusEnum = pgEnum("sync_status", [
  "running",
  "success",
  "failed",
]);

export const eventTypeEnum = pgEnum("event_type", [
  "disclosure", // DART 일반 공시
  "insider_trade", // 임원/대주주 주식 매매
  "volume_spike", // 거래량 이상 급변
]);
export const eventCategoryEnum = pgEnum("event_category", [
  "positive",
  "negative",
  "neutral",
  "info",
]);

// 사이클 인식 — Buffett 임계값을 업종 특성에 맞게 조정.
// cyclical: 반도체/조선/화학/철강/정유/자동차/항공/건설 — PBR/PER/ROE 변동 큼
// defensive: 통신/유틸/식품/생활소비재 — 안정 평가
// growth: 바이오/IT — 높은 PBR 정상
// financial: 은행/보험 — 부채비율 평가 다름 (이미 매핑은 처리)
export const cycleTypeEnum = pgEnum("cycle_type", [
  "cyclical",
  "defensive",
  "growth",
  "financial",
  "unknown",
]);

export const stocks = pgTable("stocks", {
  ticker: varchar("ticker", { length: 10 }).primaryKey(),
  name: text("name").notNull(),
  market: marketEnum("market").notNull(),
  corpCode: varchar("corp_code", { length: 8 }).unique(),
  sector: text("sector"),
  isPreferred: boolean("is_preferred").notNull().default(false),
  listedDate: date("listed_date"),
  delistedDate: date("delisted_date"),
  // 현재 시점 시장 정보 (stocks 동기화 시 FDR로 매일 갱신)
  sharesOutstanding: bigint("shares_outstanding", { mode: "bigint" }),
  marketCap: numeric("market_cap", { precision: 20, scale: 0 }),
  // 사이클 인식 — 사이클 업종은 PBR/ROE 변동 폭 크므로 평가 기준 조정.
  cycleType: cycleTypeEnum("cycle_type").notNull().default("unknown"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const financials = pgTable(
  "financials",
  {
    id: serial("id").primaryKey(),
    ticker: varchar("ticker", { length: 10 })
      .notNull()
      .references(() => stocks.ticker, { onDelete: "cascade" }),
    periodType: periodTypeEnum("period_type").notNull(),
    fiscalYear: integer("fiscal_year").notNull(),
    fiscalQuarter: integer("fiscal_quarter"),
    reportDate: date("report_date").notNull(),

    revenue: numeric("revenue", { precision: 20, scale: 0 }),
    operatingIncome: numeric("operating_income", { precision: 20, scale: 0 }),
    netIncome: numeric("net_income", { precision: 20, scale: 0 }),
    totalAssets: numeric("total_assets", { precision: 20, scale: 0 }),
    totalEquity: numeric("total_equity", { precision: 20, scale: 0 }),
    // 지배기업 소유주에게 귀속되는 자본 (PBR/BPS 계산 표준).
    // total_equity = 지배지분 + 비지배지분. KIS/네이버 등 시장 데이터는 지배지분만 사용.
    equityAttributableToOwners: numeric("equity_attributable_to_owners", {
      precision: 20,
      scale: 0,
    }),
    totalLiabilities: numeric("total_liabilities", { precision: 20, scale: 0 }),
    // 유동비율 계산용
    currentAssets: numeric("current_assets", { precision: 20, scale: 0 }),
    currentLiabilities: numeric("current_liabilities", { precision: 20, scale: 0 }),
    operatingCashFlow: numeric("operating_cash_flow", {
      precision: 20,
      scale: 0,
    }),
    capex: numeric("capex", { precision: 20, scale: 0 }),
    sharesOutstanding: bigint("shares_outstanding", { mode: "bigint" }),
    eps: numeric("eps", { precision: 15, scale: 2 }),
    bps: numeric("bps", { precision: 15, scale: 2 }),

    rawData: jsonb("raw_data"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // 연간(A) 행은 fiscal_quarter=NULL. 기본 NULL distinct 정책에선 ON CONFLICT 가
    // 동작하지 않아 중복 발생. unique constraint + NULLS NOT DISTINCT 로 NULL을 같은 값으로.
    unique("financials_period_unique")
      .on(t.ticker, t.periodType, t.fiscalYear, t.fiscalQuarter)
      .nullsNotDistinct(),
    index("financials_ticker_report_date_idx").on(
      t.ticker,
      t.reportDate.desc(),
    ),
  ],
);

export const prices = pgTable(
  "prices",
  {
    ticker: varchar("ticker", { length: 10 })
      .notNull()
      .references(() => stocks.ticker, { onDelete: "cascade" }),
    date: date("date").notNull(),
    open: numeric("open", { precision: 15, scale: 2 }),
    high: numeric("high", { precision: 15, scale: 2 }),
    low: numeric("low", { precision: 15, scale: 2 }),
    close: numeric("close", { precision: 15, scale: 2 }).notNull(),
    volume: bigint("volume", { mode: "bigint" }),
    adjClose: numeric("adj_close", { precision: 15, scale: 2 }),
  },
  (t) => [
    uniqueIndex("prices_ticker_date_pk").on(t.ticker, t.date),
    index("prices_date_idx").on(t.date),
  ],
);

export const scores = pgTable(
  "scores",
  {
    id: serial("id").primaryKey(),
    ticker: varchar("ticker", { length: 10 })
      .notNull()
      .references(() => stocks.ticker, { onDelete: "cascade" }),
    calcDate: date("calc_date").notNull(),

    buffettScore: numeric("buffett_score", { precision: 5, scale: 2 }),
    intrinsicDcf: numeric("intrinsic_dcf", { precision: 15, scale: 2 }),
    intrinsicOwnerEarnings: numeric("intrinsic_owner_earnings", {
      precision: 15,
      scale: 2,
    }),
    intrinsicGraham: numeric("intrinsic_graham", { precision: 15, scale: 2 }),
    intrinsicAvg: numeric("intrinsic_avg", { precision: 15, scale: 2 }),
    marginOfSafety: numeric("margin_of_safety", { precision: 5, scale: 2 }),
    timingSignal: timingSignalEnum("timing_signal"),

    breakdown: jsonb("breakdown"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("scores_ticker_calc_date_unique").on(t.ticker, t.calcDate),
    index("scores_calc_date_idx").on(t.calcDate),
  ],
);

export const portfolio = pgTable("portfolio", {
  id: serial("id").primaryKey(),
  ticker: varchar("ticker", { length: 10 })
    .notNull()
    .references(() => stocks.ticker),
  buyDate: date("buy_date").notNull(),
  buyPrice: numeric("buy_price", { precision: 15, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull(),
  sellDate: date("sell_date"),
  sellPrice: numeric("sell_price", { precision: 15, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  ticker: varchar("ticker", { length: 10 })
    .notNull()
    .references(() => stocks.ticker),
  decisionDate: date("decision_date").notNull(),
  decision: decisionEnum("decision").notNull(),
  reason: text("reason"),
  scoreSnapshot: jsonb("score_snapshot"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const syncLogs = pgTable("sync_logs", {
  id: serial("id").primaryKey(),
  syncType: syncTypeEnum("sync_type").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: syncStatusEnum("status").notNull(),
  recordsCount: integer("records_count"),
  errorMessage: text("error_message"),
});

export const backtestRuns = pgTable("backtest_runs", {
  id: serial("id").primaryKey(),
  // 시뮬레이션 파라미터
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  initialCapital: numeric("initial_capital", { precision: 20, scale: 0 }).notNull(),
  rebalanceFrequency: text("rebalance_frequency").notNull(), // 'monthly' | 'quarterly'
  maxPositions: integer("max_positions").notNull(),
  minScore: numeric("min_score", { precision: 5, scale: 2 }).notNull(),
  minMos: numeric("min_mos", { precision: 5, scale: 2 }).notNull(),
  txCost: numeric("tx_cost", { precision: 5, scale: 4 }).notNull(), // 0.004 = 0.4%
  // 결과 요약
  finalValue: numeric("final_value", { precision: 20, scale: 0 }),
  totalReturn: numeric("total_return", { precision: 8, scale: 4 }), // 누적 수익률 (fraction)
  kospiReturn: numeric("kospi_return", { precision: 8, scale: 4 }),
  outperformance: numeric("outperformance", { precision: 8, scale: 4 }),
  rebalanceCount: integer("rebalance_count"),
  totalTrades: integer("total_trades"),
  // 고급 지표
  maxDrawdown: numeric("max_drawdown", { precision: 8, scale: 4 }), // 최대 낙폭 (fraction, 음수)
  sharpeRatio: numeric("sharpe_ratio", { precision: 8, scale: 4 }), // 위험조정수익
  hitRate: numeric("hit_rate", { precision: 5, scale: 4 }), // 매수 종목 +수익 비율
  // 시계열 + 거래 history (jsonb)
  portfolioHistory: jsonb("portfolio_history"), // [{date, value, holdings[], cash}]
  trades: jsonb("trades"), // [{date, ticker, action, qty, price, cost}]
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    ticker: varchar("ticker", { length: 10 })
      .notNull()
      .references(() => stocks.ticker, { onDelete: "cascade" }),
    eventDate: date("event_date").notNull(),
    eventType: eventTypeEnum("event_type").notNull(),
    category: eventCategoryEnum("category").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    source: text("source").notNull(), // 'DART', 'KRX', 'computed' 등
    rawUrl: text("raw_url"),
    rawData: jsonb("raw_data"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // 같은 종목/같은 날짜/같은 타이틀은 1건만 (idempotent sync)
    unique("events_unique").on(t.ticker, t.eventDate, t.eventType, t.title)
      .nullsNotDistinct(),
    index("events_ticker_date_idx").on(t.ticker, t.eventDate.desc()),
  ],
);
