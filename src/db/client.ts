import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required (Supabase Transaction pooler, port 6543).",
  );
}

const client = postgres(process.env.DATABASE_URL, {
  prepare: false,
  max: 10,
});

export const db = drizzle(client, { schema });
export type Db = typeof db;
