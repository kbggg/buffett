ALTER TABLE "backtest_runs" ADD COLUMN "max_drawdown" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "backtest_runs" ADD COLUMN "sharpe_ratio" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "backtest_runs" ADD COLUMN "hit_rate" numeric(5, 4);