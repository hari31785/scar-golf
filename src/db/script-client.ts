// A DB client for standalone Node scripts (seeding, one-off migrations,
// etc.) that run outside the Next.js server runtime. Intentionally does
// NOT import "server-only", unlike src/db/index.ts, since that guard
// throws when loaded via a plain Node/tsx process.
//
// Do not import this from application/route code — use `@/db` there.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Add it to your .env file (see .env.example)."
  );
}

const client = postgres(databaseUrl, { max: 5 });

export const scriptDb = drizzle(client, { schema });
