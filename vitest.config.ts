import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // The "server-only" package throws when its default export is
      // resolved (only its "react-server" conditional export, mapped to
      // an empty no-op module, is safe outside Next.js's server build).
      // Aliasing it here lets tournament/DB-backed integration tests
      // import server-only modules like @/db directly, the same way
      // Next.js's server runtime does.
      "server-only": path.resolve(
        __dirname,
        "./node_modules/server-only/empty.js"
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Several tournament tests are real integration tests against the
    // shared Railway Postgres instance (no local test DB exists in this
    // project). Running test files in parallel worker processes against
    // that same remote DB can cause transaction deadlocks and slow
    // queries under Railway's connection limits, so files run
    // sequentially here, with a longer timeout to allow for real
    // network round-trips.
    fileParallelism: false,
    // Scoring tests perform many sequential real-network transactions
    // (e.g. saving 18 holes for multiple players = dozens of round
    // trips to Railway), so this needs to be generous.
    testTimeout: 120000,
    // beforeAll/afterAll hooks that build shared fixtures (championship
    // creation + enrollment + start + group setup) also perform several
    // sequential real-network round trips, so they need the same
    // generous allowance as individual tests.
    hookTimeout: 120000,
  },
});
