CREATE TABLE "cash_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"amount" numeric(20, 0) NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
