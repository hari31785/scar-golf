import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Add it to your .env file (see .env.example)."
  );
}

// A single shared connection client, reused across the app in dev via
// globalThis to avoid exhausting connections on hot reload.
const globalForDb = globalThis as unknown as {
  __scarDbClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__scarDbClient ??
  postgres(databaseUrl, {
    // Keep the pool small; Railway/Postgres free tiers have limited slots.
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__scarDbClient = client;
}

export const db = drizzle(client, { schema });

export { schema };

/**
 * The executor type passed into a `db.transaction(async (tx) => ...)`
 * callback. Exported so services that need to optionally participate
 * in an OUTER caller-supplied transaction (rather than always opening
 * their own) can type that parameter precisely, without each service
 * re-deriving it independently.
 */
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
