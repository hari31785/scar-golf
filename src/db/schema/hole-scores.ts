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
import { championshipPlayers } from "./championship-players";
import { roundGroups } from "./round-groups";
import { members } from "./members";

/**
 * The single authoritative gross score for one championship player, on
 * one hole, in one championship round. There is deliberately no
 * separate "current score" table — this row IS the current/authoritative
 * value. Corrections (see src/lib/tournament/scoring/correction.ts)
 * update this row in place and append an entry to `score_audit_log`
 * rather than creating a second table.
 *
 * `roundGroupId` is stored (denormalized from the group the player was
 * assigned to for this round) purely for convenient querying/display —
 * it is NOT trusted for authorization. Authorization always re-derives
 * actual group membership from `round_group_players` at write time (see
 * src/lib/tournament/scoring/hole-score.ts) since a client-supplied
 * group id must never be trusted.
 */
export const holeScores = pgTable(
  "hole_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    championshipRoundId: uuid("championship_round_id")
      .notNull()
      .references(() => championshipRounds.id, { onDelete: "cascade" }),

    championshipPlayerId: uuid("championship_player_id")
      .notNull()
      .references(() => championshipPlayers.id, { onDelete: "cascade" }),

    roundGroupId: uuid("round_group_id")
      .notNull()
      .references(() => roundGroups.id, { onDelete: "cascade" }),

    holeNumber: integer("hole_number").notNull(),
    grossScore: integer("gross_score").notNull(),

    createdByMemberId: uuid("created_by_member_id")
      .notNull()
      .references(() => members.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("hole_scores_round_player_hole_unique_idx").on(
      table.championshipRoundId,
      table.championshipPlayerId,
      table.holeNumber
    ),
    check(
      "hole_scores_hole_number_range_chk",
      sql`${table.holeNumber} >= 1 AND ${table.holeNumber} <= 18`
    ),
    // "Positive reasonable integer" — a single hole score of 1-20
    // covers every realistic gross score (including very high scores on
    // a par-5 for a beginner) while still rejecting garbage input.
    check(
      "hole_scores_gross_score_range_chk",
      sql`${table.grossScore} >= 1 AND ${table.grossScore} <= 20`
    ),
  ]
);

export type HoleScore = typeof holeScores.$inferSelect;
export type NewHoleScore = typeof holeScores.$inferInsert;
