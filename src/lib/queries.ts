import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { events, financials, scores, stocks } from "@/db/schema";

export type Candidate = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  marketCap: number | null;
  buffettScore: number;
  marginOfSafety: number | null;
  timingSignal: "BUY" | "WATCH" | "NEUTRAL" | null;
  intrinsicAvg: number | null;
  breakdown: BreakdownShape | null;
  // 최근 연간 재무 기반 derived ratios (계산: 시총 / 자본 = PBR, 시총 / 순이익 = PER)
  pbr: number | null;
  per: number | null;
  // 최근 90일 이벤트 (Tier 1: DART 공시 + 임원지분 + 거래량 급변)
  recentEvents: EventItem[];
  // 점수 산출의 기준 — 가장 최근 사업보고서 시점
  fundamentalsAsOf: string | null; // YYYY-MM-DD (report_date of latest annual)
  fiscalYear: number | null;
};

export type EventItem = {
  date: string;
  type: "disclosure" | "insider_trade" | "volume_spike";
  category: "positive" | "negative" | "neutral" | "info";
  title: string;
};

export type BreakdownShape = {
  components: Record<
    string,
    { score: number; max: number; details: Record<string, unknown> }
  >;
  intrinsic?: {
    details?: Record<string, unknown>;
    average?: number | null;
    margin_of_safety_raw?: number | null;
  };
  timing?: {
    signal?: string | null;
    pos_52w?: number | null;
    rsi_14?: number | null;
    ma_200?: number | null;
    current_price?: number | null;
    above_ma200?: boolean | null;
    pos_ok?: boolean | null;
    rsi_ok?: boolean | null;
  };
  data_window_years?: number;
};

export async function getLatestCalcDate(): Promise<string | null> {
  const row = await db
    .select({ d: sql<string>`max(${scores.calcDate})` })
    .from(scores);
  return row[0]?.d ?? null;
}

export async function getCandidates(opts: {
  calcDate: string;
  minScore?: number;
  minMos?: number;
  timingOnly?: ("BUY" | "WATCH" | "NEUTRAL")[];
  limit?: number;
}): Promise<Candidate[]> {
  const conditions = [eq(scores.calcDate, opts.calcDate)];
  if (opts.minScore !== undefined) {
    conditions.push(gte(scores.buffettScore, String(opts.minScore)));
  }
  if (opts.minMos !== undefined) {
    conditions.push(gte(scores.marginOfSafety, String(opts.minMos)));
    conditions.push(isNotNull(scores.marginOfSafety));
  }
  if (opts.timingOnly && opts.timingOnly.length > 0) {
    conditions.push(
      sql`${scores.timingSignal} in ${sql.raw(`(${opts.timingOnly.map((t) => `'${t}'`).join(",")})`)}`,
    );
  }

  const rows = await db
    .select({
      ticker: scores.ticker,
      name: stocks.name,
      market: stocks.market,
      marketCap: stocks.marketCap,
      buffettScore: scores.buffettScore,
      marginOfSafety: scores.marginOfSafety,
      timingSignal: scores.timingSignal,
      intrinsicAvg: scores.intrinsicAvg,
      breakdown: scores.breakdown,
    })
    .from(scores)
    .innerJoin(stocks, eq(stocks.ticker, scores.ticker))
    .where(and(...conditions))
    .orderBy(desc(scores.buffettScore), desc(scores.marginOfSafety))
    .limit(opts.limit ?? 100);

  // PBR/PER 계산용: 각 종목의 최신 연간.
  // PBR 표준은 "지배기업주주귀속 자본" 사용 (KIS/네이버 등 시장 데이터와 일치).
  // 미수집 종목은 total_equity 폴백.
  const tickers = rows.map((r) => r.ticker);
  const finRows = tickers.length
    ? await db
        .select({
          ticker: financials.ticker,
          fiscalYear: financials.fiscalYear,
          reportDate: financials.reportDate,
          totalEquity: financials.totalEquity,
          equityAttributable: financials.equityAttributableToOwners,
          netIncome: financials.netIncome,
        })
        .from(financials)
        .where(
          and(eq(financials.periodType, "A"), inArray(financials.ticker, tickers)),
        )
    : [];
  const latestByTicker = new Map<
    string,
    {
      totalEquity: string | null;
      equityAttributable: string | null;
      netIncome: string | null;
      reportDate: string | null;
      _y: number;
    }
  >();
  for (const r of finRows) {
    const cur = latestByTicker.get(r.ticker);
    if (!cur || cur._y < r.fiscalYear) {
      latestByTicker.set(r.ticker, {
        totalEquity: r.totalEquity,
        equityAttributable: r.equityAttributable,
        netIncome: r.netIncome,
        reportDate: r.reportDate ? String(r.reportDate) : null,
        _y: r.fiscalYear,
      });
    }
  }

  // 최근 이벤트도 같은 ticker 셋으로 batch fetch
  const eventRows = tickers.length
    ? await db
        .select({
          ticker: events.ticker,
          eventDate: events.eventDate,
          eventType: events.eventType,
          category: events.category,
          title: events.title,
        })
        .from(events)
        .where(inArray(events.ticker, tickers))
        .orderBy(desc(events.eventDate))
    : [];
  const eventsByTicker = new Map<string, EventItem[]>();
  for (const e of eventRows) {
    const list = eventsByTicker.get(e.ticker) ?? [];
    list.push({
      date: e.eventDate,
      type: e.eventType as EventItem["type"],
      category: e.category as EventItem["category"],
      title: e.title,
    });
    eventsByTicker.set(e.ticker, list);
  }

  return rows.map((r) => {
    const mc = r.marketCap !== null ? Number(r.marketCap) : null;
    const fin = latestByTicker.get(r.ticker);
    // 지배지분 우선, 없으면 전체 자본총계 폴백
    const eq = fin?.equityAttributable
      ? Number(fin.equityAttributable)
      : fin?.totalEquity
        ? Number(fin.totalEquity)
        : null;
    const ni = fin?.netIncome ? Number(fin.netIncome) : null;
    const pbr = mc !== null && eq !== null && eq > 0 ? mc / eq : null;
    const per = mc !== null && ni !== null && ni > 0 ? mc / ni : null;
    return {
      ticker: r.ticker,
      name: r.name,
      market: r.market as "KOSPI" | "KOSDAQ",
      marketCap: mc,
      buffettScore: Number(r.buffettScore ?? 0),
      marginOfSafety:
        r.marginOfSafety !== null ? Number(r.marginOfSafety) : null,
      timingSignal: r.timingSignal as Candidate["timingSignal"],
      intrinsicAvg:
        r.intrinsicAvg !== null ? Number(r.intrinsicAvg) : null,
      breakdown: r.breakdown as BreakdownShape | null,
      pbr,
      per,
      recentEvents: eventsByTicker.get(r.ticker) ?? [],
      fundamentalsAsOf: fin?.reportDate ?? null,
      fiscalYear: fin?._y ?? null,
    };
  });
}

export type StockDetail = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  marketCap: number | null;
  sharesOutstanding: number | null;
  buffettScore: number | null;
  marginOfSafety: number | null;
  timingSignal: "BUY" | "WATCH" | "NEUTRAL" | null;
  intrinsicDcf: number | null;
  intrinsicOwnerEarnings: number | null;
  intrinsicGraham: number | null;
  intrinsicAvg: number | null;
  breakdown: BreakdownShape | null;
  pbr: number | null;
  per: number | null;
  latestPrice: number | null;
  annuals: AnnualSummary[];
  events: EventItem[];
};

export type PortfolioPosition = {
  id: number;
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  buyDate: string;
  buyPrice: number;
  quantity: number;
  sellDate: string | null;
  sellPrice: number | null;
  notes: string | null;
  // 파생 (서버에서 계산)
  currentPrice: number | null;
  currentValue: number | null;
  buyValue: number;
  pnl: number | null;
  pnlPct: number | null;
  isClosed: boolean;
  // 권장 액션 입력 (보유 종목만)
  buffettScore: number | null;
  marginOfSafety: number | null;
  timingSignal: "BUY" | "WATCH" | "NEUTRAL" | null;
  intrinsicAvg: number | null;
  recentNegativeEvents: number;
};

export async function getPortfolio(): Promise<PortfolioPosition[]> {
  const rows = await db.execute(sql`
    select p.id, p.ticker, p.buy_date, p.buy_price, p.quantity,
           p.sell_date, p.sell_price, p.notes,
           s.name, s.market,
           (select close from prices pr where pr.ticker = p.ticker order by date desc limit 1) as latest_price,
           sc.buffett_score, sc.margin_of_safety, sc.timing_signal, sc.intrinsic_avg,
           (select count(*) from events ev where ev.ticker = p.ticker and ev.category = 'negative'
            and ev.event_date >= current_date - interval '90 days') as neg_events
    from portfolio p
    join stocks s on s.ticker = p.ticker
    left join lateral (
      select * from scores where ticker = p.ticker order by calc_date desc limit 1
    ) sc on true
    order by p.sell_date is null desc, p.buy_date desc
  `);
  return rows.map((r) => {
    const buyPrice = Number(r.buy_price);
    const qty = Number(r.quantity);
    const sellPrice = r.sell_price !== null ? Number(r.sell_price) : null;
    const latestPrice = r.latest_price !== null ? Number(r.latest_price) : null;
    const isClosed = r.sell_date !== null;
    const currentPrice = isClosed ? sellPrice : latestPrice;
    const buyValue = buyPrice * qty;
    const currentValue = currentPrice !== null ? currentPrice * qty : null;
    const pnl = currentValue !== null ? currentValue - buyValue : null;
    const pnlPct = pnl !== null ? pnl / buyValue : null;
    return {
      id: Number(r.id),
      ticker: String(r.ticker),
      name: String(r.name),
      market: String(r.market) as "KOSPI" | "KOSDAQ",
      buyDate: String(r.buy_date),
      buyPrice,
      quantity: qty,
      sellDate: r.sell_date !== null ? String(r.sell_date) : null,
      sellPrice,
      notes: r.notes !== null ? String(r.notes) : null,
      currentPrice,
      currentValue,
      buyValue,
      pnl,
      pnlPct,
      isClosed,
      buffettScore: r.buffett_score !== null ? Number(r.buffett_score) : null,
      marginOfSafety: r.margin_of_safety !== null ? Number(r.margin_of_safety) : null,
      timingSignal: (r.timing_signal ?? null) as PortfolioPosition["timingSignal"],
      intrinsicAvg: r.intrinsic_avg !== null ? Number(r.intrinsic_avg) : null,
      recentNegativeEvents: r.neg_events !== null ? Number(r.neg_events) : 0,
    };
  });
}

export type AnnualSummary = {
  fiscalYear: number;
  reportDate: string;
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  totalEquity: number | null;
  equityAttributableToOwners: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  operatingCashFlow: number | null;
  capex: number | null;
  eps: number | null;
};

export async function getStockDetail(ticker: string): Promise<StockDetail | null> {
  const stk = await db
    .select({
      ticker: stocks.ticker,
      name: stocks.name,
      market: stocks.market,
      marketCap: stocks.marketCap,
      sharesOutstanding: stocks.sharesOutstanding,
    })
    .from(stocks)
    .where(eq(stocks.ticker, ticker))
    .limit(1);
  if (stk.length === 0) return null;
  const s = stk[0];

  const sc = await db
    .select({
      buffettScore: scores.buffettScore,
      marginOfSafety: scores.marginOfSafety,
      timingSignal: scores.timingSignal,
      intrinsicDcf: scores.intrinsicDcf,
      intrinsicOwnerEarnings: scores.intrinsicOwnerEarnings,
      intrinsicGraham: scores.intrinsicGraham,
      intrinsicAvg: scores.intrinsicAvg,
      breakdown: scores.breakdown,
    })
    .from(scores)
    .where(eq(scores.ticker, ticker))
    .orderBy(desc(scores.calcDate))
    .limit(1);

  const annualRows = await db
    .select({
      fiscalYear: financials.fiscalYear,
      reportDate: financials.reportDate,
      revenue: financials.revenue,
      operatingIncome: financials.operatingIncome,
      netIncome: financials.netIncome,
      totalEquity: financials.totalEquity,
      equityAttributableToOwners: financials.equityAttributableToOwners,
      totalAssets: financials.totalAssets,
      totalLiabilities: financials.totalLiabilities,
      currentAssets: financials.currentAssets,
      currentLiabilities: financials.currentLiabilities,
      operatingCashFlow: financials.operatingCashFlow,
      capex: financials.capex,
      eps: financials.eps,
    })
    .from(financials)
    .where(and(eq(financials.ticker, ticker), eq(financials.periodType, "A")))
    .orderBy(desc(financials.fiscalYear));

  const eventRows = await db
    .select({
      eventDate: events.eventDate,
      eventType: events.eventType,
      category: events.category,
      title: events.title,
    })
    .from(events)
    .where(eq(events.ticker, ticker))
    .orderBy(desc(events.eventDate))
    .limit(50);

  const latestPriceRow = await db.execute(sql`
    select close from prices where ticker = ${ticker} order by date desc limit 1
  `);
  const latestPrice =
    latestPriceRow.length > 0 && latestPriceRow[0].close !== null
      ? Number(latestPriceRow[0].close)
      : null;

  const score = sc[0];
  const mc = s.marketCap !== null ? Number(s.marketCap) : null;
  const latest = annualRows[0];
  const equity = latest?.equityAttributableToOwners
    ? Number(latest.equityAttributableToOwners)
    : latest?.totalEquity
      ? Number(latest.totalEquity)
      : null;
  const ni = latest?.netIncome ? Number(latest.netIncome) : null;
  const pbr = mc !== null && equity !== null && equity > 0 ? mc / equity : null;
  const per = mc !== null && ni !== null && ni > 0 ? mc / ni : null;

  return {
    ticker: s.ticker,
    name: s.name,
    market: s.market as "KOSPI" | "KOSDAQ",
    marketCap: mc,
    sharesOutstanding:
      s.sharesOutstanding !== null ? Number(s.sharesOutstanding) : null,
    buffettScore: score?.buffettScore ? Number(score.buffettScore) : null,
    marginOfSafety:
      score?.marginOfSafety !== null && score?.marginOfSafety !== undefined
        ? Number(score.marginOfSafety)
        : null,
    timingSignal: (score?.timingSignal ?? null) as StockDetail["timingSignal"],
    intrinsicDcf: score?.intrinsicDcf ? Number(score.intrinsicDcf) : null,
    intrinsicOwnerEarnings: score?.intrinsicOwnerEarnings
      ? Number(score.intrinsicOwnerEarnings)
      : null,
    intrinsicGraham: score?.intrinsicGraham ? Number(score.intrinsicGraham) : null,
    intrinsicAvg: score?.intrinsicAvg ? Number(score.intrinsicAvg) : null,
    breakdown: (score?.breakdown ?? null) as BreakdownShape | null,
    pbr,
    per,
    latestPrice,
    annuals: annualRows.map((r) => ({
      fiscalYear: r.fiscalYear,
      reportDate: String(r.reportDate),
      revenue: r.revenue !== null ? Number(r.revenue) : null,
      operatingIncome:
        r.operatingIncome !== null ? Number(r.operatingIncome) : null,
      netIncome: r.netIncome !== null ? Number(r.netIncome) : null,
      totalEquity: r.totalEquity !== null ? Number(r.totalEquity) : null,
      equityAttributableToOwners:
        r.equityAttributableToOwners !== null
          ? Number(r.equityAttributableToOwners)
          : null,
      totalAssets: r.totalAssets !== null ? Number(r.totalAssets) : null,
      totalLiabilities:
        r.totalLiabilities !== null ? Number(r.totalLiabilities) : null,
      currentAssets:
        r.currentAssets !== null ? Number(r.currentAssets) : null,
      currentLiabilities:
        r.currentLiabilities !== null ? Number(r.currentLiabilities) : null,
      operatingCashFlow:
        r.operatingCashFlow !== null ? Number(r.operatingCashFlow) : null,
      capex: r.capex !== null ? Number(r.capex) : null,
      eps: r.eps !== null ? Number(r.eps) : null,
    })),
    events: eventRows.map((e) => ({
      date: String(e.eventDate),
      type: e.eventType as EventItem["type"],
      category: e.category as EventItem["category"],
      title: e.title,
    })),
  };
}

export async function getPriceSeries(
  ticker: string,
  days: number,
): Promise<{ date: string; close: number }[]> {
  const rows = await db.execute(sql`
    select date, close from prices
    where ticker = ${ticker}
    order by date desc
    limit ${days}
  `);
  return rows
    .map((r) => ({ date: String(r.date), close: Number(r.close) }))
    .reverse();
}

// === Backtest queries ===

export type BacktestRun = {
  id: number;
  startDate: string;
  endDate: string;
  initialCapital: number;
  rebalanceFrequency: string;
  maxPositions: number;
  minScore: number;
  minMos: number;
  txCost: number;
  finalValue: number | null;
  totalReturn: number | null;
  kospiReturn: number | null;
  outperformance: number | null;
  rebalanceCount: number | null;
  totalTrades: number | null;
  portfolioHistory: PortfolioSnapshot[];
  trades: BacktestTrade[];
  createdAt: string;
};

export type PortfolioSnapshot = {
  date: string;
  nav: number;
  cash: number;
  holdings: Record<string, number>;
};

export type BacktestTrade = {
  date: string;
  ticker: string;
  action: "BUY" | "SELL";
  qty: number;
  price: number;
  cost: number;
};

function rowToBacktestRun(r: Record<string, unknown>): BacktestRun {
  return {
    id: Number(r.id),
    startDate: String(r.start_date),
    endDate: String(r.end_date),
    initialCapital: Number(r.initial_capital),
    rebalanceFrequency: String(r.rebalance_frequency),
    maxPositions: Number(r.max_positions),
    minScore: Number(r.min_score),
    minMos: Number(r.min_mos),
    txCost: Number(r.tx_cost),
    finalValue: r.final_value !== null ? Number(r.final_value) : null,
    totalReturn: r.total_return !== null ? Number(r.total_return) : null,
    kospiReturn: r.kospi_return !== null ? Number(r.kospi_return) : null,
    outperformance: r.outperformance !== null ? Number(r.outperformance) : null,
    rebalanceCount: r.rebalance_count !== null ? Number(r.rebalance_count) : null,
    totalTrades: r.total_trades !== null ? Number(r.total_trades) : null,
    portfolioHistory: (r.portfolio_history ?? []) as PortfolioSnapshot[],
    trades: (r.trades ?? []) as BacktestTrade[],
    createdAt: String(r.created_at),
  };
}

export async function getLatestBacktest(): Promise<BacktestRun | null> {
  const rows = await db.execute(sql`
    select * from backtest_runs order by created_at desc limit 1
  `);
  if (rows.length === 0) return null;
  return rowToBacktestRun(rows[0]);
}

export async function getBacktestById(id: number): Promise<BacktestRun | null> {
  const rows = await db.execute(sql`
    select * from backtest_runs where id = ${id} limit 1
  `);
  if (rows.length === 0) return null;
  return rowToBacktestRun(rows[0]);
}

export async function getBacktestHistory(limit = 20) {
  const rows = await db.execute(sql`
    select id, start_date, end_date, total_return, kospi_return, outperformance,
           max_positions, rebalance_frequency, created_at
    from backtest_runs
    order by created_at desc
    limit ${limit}
  `);
  return rows.map((r) => ({
    id: Number(r.id),
    startDate: String(r.start_date),
    endDate: String(r.end_date),
    totalReturn: r.total_return !== null ? Number(r.total_return) : null,
    kospiReturn: r.kospi_return !== null ? Number(r.kospi_return) : null,
    outperformance: r.outperformance !== null ? Number(r.outperformance) : null,
    maxPositions: Number(r.max_positions),
    rebalanceFrequency: String(r.rebalance_frequency),
    createdAt: String(r.created_at),
  }));
}

export async function getStockNames(tickers: string[]): Promise<Record<string, string>> {
  if (tickers.length === 0) return {};
  const rows = await db
    .select({ ticker: stocks.ticker, name: stocks.name })
    .from(stocks)
    .where(inArray(stocks.ticker, tickers));
  return Object.fromEntries(rows.map((r) => [r.ticker, r.name]));
}

export async function getKospiSeries(start: string, end: string) {
  const rows = await db.execute(sql`
    select date, close from prices
    where ticker = 'KS11' and date >= ${start} and date <= ${end}
    order by date asc
  `);
  return rows.map((r) => ({ date: String(r.date), close: Number(r.close) }));
}

export async function getCounts(calcDate: string) {
  const all = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(scores)
    .where(eq(scores.calcDate, calcDate));
  const valuePass = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(scores)
    .where(
      and(
        eq(scores.calcDate, calcDate),
        gte(scores.buffettScore, "80"),
        gte(scores.marginOfSafety, "0.30"),
      ),
    );
  const buy = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(scores)
    .where(
      and(
        eq(scores.calcDate, calcDate),
        gte(scores.buffettScore, "80"),
        gte(scores.marginOfSafety, "0.30"),
        eq(scores.timingSignal, "BUY"),
      ),
    );
  return {
    all: all[0]?.n ?? 0,
    valuePass: valuePass[0]?.n ?? 0,
    buy: buy[0]?.n ?? 0,
  };
}
