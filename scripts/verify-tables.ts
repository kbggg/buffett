import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL_DIRECT;
  if (!url) throw new Error("DATABASE_URL_DIRECT not set");
  const sql = postgres(url, { prepare: false, max: 1 });

  const tables = await sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
    order by table_name
  `;
  console.log("Tables in public schema:");
  for (const t of tables) console.log(`  - ${t.table_name}`);

  const enums = await sql<{ typname: string }[]>`
    select typname
    from pg_type
    where typtype = 'e'
      and typnamespace = (select oid from pg_namespace where nspname = 'public')
    order by typname
  `;
  console.log("\nEnums:");
  for (const e of enums) console.log(`  - ${e.typname}`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
