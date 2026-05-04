ALTER TABLE "cash_balances" ADD COLUMN "nickname" text DEFAULT 'me' NOT NULL;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "nickname" text DEFAULT 'me' NOT NULL;--> statement-breakpoint
ALTER TABLE "portfolio" ADD COLUMN "nickname" text DEFAULT 'me' NOT NULL;