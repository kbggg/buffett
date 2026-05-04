import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

async function test(label: string, urlEnv: string) {
  const url = process.env[urlEnv];
  if (!url) {
    console.log(`✗ ${label} (${urlEnv}): not set`);
    return;
  }
  // Mask password for display
  const masked = url.replace(/:([^:@]+)@/, ":***@");
  console.log(`\n→ ${label}: ${masked}`);
  try {
    const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10 });
    const rows = await sql`select version()`;
    console.log(`  ✓ connected: ${(rows[0] as { version: string }).version.slice(0, 60)}...`);
    await sql.end();
  } catch (e) {
    console.log(`  ✗ failed: ${(e as Error).message}`);
  }
}

async function main() {
  await test("Transaction pooler (DATABASE_URL)", "DATABASE_URL");
  await test("Session pooler (DATABASE_URL_DIRECT)", "DATABASE_URL_DIRECT");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
