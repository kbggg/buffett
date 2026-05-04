import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });

// `generate`는 DB 접속 불필요. `migrate`/`push`/`studio`만 url을 실제로 사용.
// 미설정 시 placeholder를 넣어 generate가 동작하게 하고, 실제 접속 시 명확한 에러를 띄움.
const url =
  process.env.DATABASE_URL_DIRECT ??
  "postgresql://__SET_DATABASE_URL_DIRECT_IN_ENV_LOCAL__";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
