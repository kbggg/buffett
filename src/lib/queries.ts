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
    };
  });
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
