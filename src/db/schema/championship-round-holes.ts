import {
  check,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { championshipRounds } from "./championship-rounds";

/**
 * One of the 18 holes for a championship round: its par and stroke
 * index (handicap difficulty ranking, 1 = hardest). Course rating and
 * slope are TEE-LEVEL values and live on `championship_rounds`, not
 * here — this table is purely the hole-by-hole layout.
 *
 * Frozen once the championship becomes ACTIVE, same as the round-level
 * course/tee snapshot on `championship_rounds` (see that module's doc
 * comment) — enforced by the course-setup service
 * (src/lib/tournament/course-setup.ts), not by the schema itself.
 */
export const championshipRoundHoles = pgTable(
  "championship_round_holes",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    championshipRoundId: uuid("championship_round_id")
      .notNull()
      .references(() => championshipRounds.id, { onDelete: "cascade" }),

    holeNumber: integer("hole_number").notNull(),
    par: integer("par").notNull(),
    strokeIndex: integer("stroke_index").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("championship_round_holes_round_hole_unique_idx").on(
      table.championshipRoundId,
      table.holeNumber
    ),
    check(
      "championship_round_holes_hole_number_range_chk",
      sql`${table.holeNumber} >= 1 AND ${table.holeNumber} <= 18`
    ),
    check(
      "championship_round_holes_stroke_index_range_chk",
      sql`${table.strokeIndex} >= 1 AND ${table.strokeIndex} <= 18`
    ),
    check(
      "championship_round_holes_par_range_chk",
      sql`${table.par} >= 3 AND ${table.par} <= 6`
    ),
  ]
);

export type ChampionshipRoundHole = typeof championshipRoundHoles.$inferSelect;
export type NewChampionshipRoundHole = typeof championshipRoundHoles.$inferInsert;
