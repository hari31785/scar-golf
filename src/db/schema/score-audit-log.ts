import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { championshipRounds } from "./championship-rounds";
import { championshipPlayers } from "./championship-players";
import { holeScores } from "./hole-scores";
import { members } from "./members";

/**
 * Permanent, append-only audit trail for every ADMIN correction made to
 * an authoritative `hole_scores` row.
 *
 * There is intentionally NO update or delete API for this table
 * anywhere in the codebase (see
 * src/lib/tournament/scoring/correction.ts) — every correction inserts
 * exactly one new row here and existing rows are never modified,
 * preserving a complete, trustworthy history of every change ever made.
 */
export const scoreAuditLog = pgTable("score_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),

  championshipRoundId: uuid("championship_round_id")
    .notNull()
    .references(() => championshipRounds.id, { onDelete: "cascade" }),

  championshipPlayerId: uuid("championship_player_id")
    .notNull()
    .references(() => championshipPlayers.id, { onDelete: "cascade" }),

  holeNumber: integer("hole_number").notNull(),

  holeScoreId: uuid("hole_score_id")
    .notNull()
    .references(() => holeScores.id, { onDelete: "cascade" }),

  originalGrossScore: integer("original_gross_score").notNull(),
  newGrossScore: integer("new_gross_score").notNull(),

  changedByMemberId: uuid("changed_by_member_id")
    .notNull()
    .references(() => members.id, { onDelete: "set null" }),

  reason: text("reason"),

  changedAt: timestamp("changed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ScoreAuditLogRow = typeof scoreAuditLog.$inferSelect;
export type NewScoreAuditLogRow = typeof scoreAuditLog.$inferInsert;
