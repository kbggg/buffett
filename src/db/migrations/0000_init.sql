CREATE TYPE "public"."decision" AS ENUM('BUY', 'SELL', 'WATCH', 'SKIP');--> statement-breakpoint
CREATE TYPE "public"."market" AS ENUM('KOSPI', 'KOSDAQ');--> statement-breakpoint
CREATE TYPE "public"."period_type" AS ENUM('Q', 'A');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sync_type" AS ENUM('stocks', 'financials', 'prices', 'scores');--> statement-breakpoint
CREATE TYPE "public"."timing_signal" AS ENUM('BUY', 'WATCH', 'NEUTRAL');--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticker" varchar(10) NOT NULL,
	"decision_date" date NOT NULL,
	"decision" "decision" NOT NULL,
	"reason" text,
	"score_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financials" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticker" varchar(10) NOT NULL,
	"period_type" "period_type" NOT NULL,
	"fiscal_year" integer NOT NULL,
	"fiscal_quarter" integer,
	"report_date" date NOT NULL,
	"revenue" numeric(20, 0),
	"operating_income" numeric(20, 0),
	"net_income" numeric(20, 0),
	"total_assets" numeric(20, 0),
	"total_equity" numeric(20, 0),
	"total_liabilities" numeric(20, 0),
	"operating_cash_flow" numeric(20, 0),
	"capex" numeric(20, 0),
	"shares_outstanding" bigint,
	"eps" numeric(15, 2),
	"bps" numeric(15, 2),
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticker" varchar(10) NOT NULL,
	"buy_date" date NOT NULL,
	"buy_price" numeric(15, 2) NOT NULL,
	"quantity" integer NOT NULL,
	"sell_date" date,
	"sell_price" numeric(15, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"ticker" varchar(10) NOT NULL,
	"date" date NOT NULL,
	"open" numeric(15, 2),
	"high" numeric(15, 2),
	"low" numeric(15, 2),
	"close" numeric(15, 2) NOT NULL,
	"volume" bigint,
	"adj_close" numeric(15, 2)
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticker" varchar(10) NOT NULL,
	"calc_date" date NOT NULL,
	"buffett_score" numeric(5, 2),
	"intrinsic_dcf" numeric(15, 2),
	"intrinsic_owner_earnings" numeric(15, 2),
	"intrinsic_graham" numeric(15, 2),
	"intrinsic_avg" numeric(15, 2),
	"margin_of_safety" numeric(5, 2),
	"timing_signal" "timing_signal",
	"breakdown" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stocks" (
	"ticker" varchar(10) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"market" "market" NOT NULL,
	"corp_code" varchar(8),
	"sector" text,
	"is_preferred" boolean DEFAULT false NOT NULL,
	"listed_date" date,
	"delisted_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stocks_corp_code_unique" UNIQUE("corp_code")
);
--> statement-breakpoint
CREATE TABLE "sync_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"sync_type" "sync_type" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "sync_status" NOT NULL,
	"records_count" integer,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_ticker_stocks_ticker_fk" FOREIGN KEY ("ticker") REFERENCES "public"."stocks"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financials" ADD CONSTRAINT "financials_ticker_stocks_ticker_fk" FOREIGN KEY ("ticker") REFERENCES "public"."stocks"("ticker") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio" ADD CONSTRAINT "portfolio_ticker_stocks_ticker_fk" FOREIGN KEY ("ticker") REFERENCES "public"."stocks"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_ticker_stocks_ticker_fk" FOREIGN KEY ("ticker") REFERENCES "public"."stocks"("ticker") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_ticker_stocks_ticker_fk" FOREIGN KEY ("ticker") REFERENCES "public"."stocks"("ticker") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "financials_period_unique" ON "financials" USING btree ("ticker","period_type","fiscal_year","fiscal_quarter");--> statement-breakpoint
CREATE INDEX "financials_ticker_report_date_idx" ON "financials" USING btree ("ticker","report_date" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "prices_ticker_date_pk" ON "prices" USING btree ("ticker","date");--> statement-breakpoint
CREATE INDEX "prices_date_idx" ON "prices" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "scores_ticker_calc_date_unique" ON "scores" USING btree ("ticker","calc_date");--> statement-breakpoint
CREATE INDEX "scores_calc_date_idx" ON "scores" USING btree ("calc_date");