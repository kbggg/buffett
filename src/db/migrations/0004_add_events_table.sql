CREATE TYPE "public"."event_category" AS ENUM('positive', 'negative', 'neutral', 'info');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('disclosure', 'insider_trade', 'volume_spike');--> statement-breakpoint
ALTER TYPE "public"."sync_type" ADD VALUE 'events';--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticker" varchar(10) NOT NULL,
	"event_date" date NOT NULL,
	"event_type" "event_type" NOT NULL,
	"category" "event_category" NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"source" text NOT NULL,
	"raw_url" text,
	"raw_data" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_unique" UNIQUE NULLS NOT DISTINCT("ticker","event_date","event_type","title")
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_ticker_stocks_ticker_fk" FOREIGN KEY ("ticker") REFERENCES "public"."stocks"("ticker") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_ticker_date_idx" ON "events" USING btree ("ticker","event_date" DESC NULLS LAST);