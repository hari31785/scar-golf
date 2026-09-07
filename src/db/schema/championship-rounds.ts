import {
  check,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { championships } from "./championships";

/**
 * Lifecycle status of a single championship round.
 * NOT_STARTED — no groups/scoring yet.
 * IN_PROGRESS — at least one group has begun scoring.
 * COMPLETE — every ACTIVE championship participant has a complete,
 * submitted scorecard for this round (see
 * src/lib/tournament/round-completion.ts for the authoritative rule).
 */
export const roundStatusEnum = pgEnum("championship_round_status", [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETE",
]);

/**
 * One of exactly 4 rounds (18 holes each) within a championship.
 *
 * Course/tee fields are SNAPSHOTS, following the same pattern as
 * `played_rounds` (see src/db/schema/rounds.ts) — once scoring starts
 * for a round these values must not change retroactively, since scores
 * already recorded against this round depend on them.
 *
 * Course data is intentionally NOT normalized into a separate courses
 * table yet, matching the existing historical-rounds precedent.
 */
export const championshipRounds = pgTable(
  "championship_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    championshipId: uuid("championship_id")
      .notNull()
      .references(() => championships.id, { onDelete: "cascade" }),

    roundNumber: integer("round_number").notNull(),

    // Null until the round is actually played/scheduled with a real date.
    playedDate: timestamp("played_date", { withTimezone: true }),

    status: roundStatusEnum("status").notNull().default("NOT_STARTED"),

    // Course/tee snapshot — see module doc comment above. All nullable
    // since a round can exist (created at championship-creation time)
    // before its course/tee has been decided.
    courseName: varchar("course_name", { length: 200 }),
    courseCity: varchar("course_city", { length: 200 }),
    teeName: varchar("tee_name", { length: 100 }),
    // Text, not an enum — courses use arbitrary tee names/colors
    // (Black, Blue, White, Gold, Green, Combo, etc.) that aren't a
    // fixed, enumerable set.
    teeColor: varchar("tee_color", { length: 50 }),
    courseRating: numeric("course_rating", {
      precision: 4,
      scale: 1,
      mode: "number",
    }),
    slope: integer("slope"),
    // Round total par ("totalPar" in service/UI code) — tee-level, not
    // hole-level. Hole-by-hole par lives in championship_round_holes.
    par: integer("par"),
    yardage: integer("yardage"),


    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("championship_rounds_championship_round_number_unique_idx").on(
      table.championshipId,
      table.roundNumber
    ),
    check(
      "championship_rounds_round_number_range_chk",
      sql`${table.roundNumber} >= 1 AND ${table.roundNumber} <= 4`
    ),
  ]
);

export type ChampionshipRound = typeof championshipRounds.$inferSelect;
export type NewChampionshipRound = typeof championshipRounds.$inferInsert;
