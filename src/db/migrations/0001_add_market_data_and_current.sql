ALTER TABLE "financials" ADD COLUMN "current_assets" numeric(20, 0);--> statement-breakpoint
ALTER TABLE "financials" ADD COLUMN "current_liabilities" numeric(20, 0);--> statement-breakpoint
ALTER TABLE "stocks" ADD COLUMN "shares_outstanding" bigint;--> statement-breakpoint
ALTER TABLE "stocks" ADD COLUMN "market_cap" numeric(20, 0);