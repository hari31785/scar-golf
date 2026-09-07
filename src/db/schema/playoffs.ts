import {
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { championships } from "./championships";
import { championshipPlayers } from "./championship-players";
import { members } from "./members";

/**
 * Lifecycle status of a sudden-death playoff session used to resolve a
 * tied first-place championship finish after Round 4.
 *
 * IN_PROGRESS — created; holes are being recorded one at a time.
 * RESOLVED — a unique winner has been recorded on some hole; the
 * championship's `championMemberId`/COMPLETED transition happens in the
 * SAME transaction as the hole that resolved it (see
 * src/lib/tournament/playoff.ts).
 *
 * Exactly one playoff session may exist per championship (see the
 * unique index below) — this is a first, narrow slice: it does not
 * support re-opening/cancelling a playoff.
 */
export const playoffSessionStatusEnum = pgEnum("playoff_session_status", [
  "IN_PROGRESS",
  "RESOLVED",
]);

/**
 * A sudden-death playoff session created to resolve a tie for first
 * place after a championship's Round 4 is COMPLETE. Deliberately
 * separate from normal tournament scoring (`hole_scores`,
 * `scorecard_submissions`, `championship_rounds`) — playoff holes are
 * NOT part of the 72-hole stroke-play competition and must never affect
 * frozen handicaps, 4-round gross/net totals, or `finalPosition`
 * (already persisted by `finalizeChampionship` before a playoff is ever
 * needed).
 */
export const playoffSessions = pgTable(
  "playoff_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    championshipId: uuid("championship_id")
      .notNull()
      .references(() => championships.id, { onDelete: "cascade" }),

    status: playoffSessionStatusEnum("status")
      .notNull()
      .default("IN_PROGRESS"),

    // Set only once a unique playoff-hole winner is recorded.
    winnerChampionshipPlayerId: uuid(
      "winner_championship_player_id"
    ).references(() => championshipPlayers.id, { onDelete: "set null" }),

    createdByMemberId: uuid("created_by_member_id").references(
      () => members.id,
      { onDelete: "set null" }
    ),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // At most one playoff session per championship — this first slice
    // does not support re-running a playoff for the same championship.
    uniqueIndex("playoff_sessions_championship_unique_idx").on(
      table.championshipId
    ),
  ]
);

/**
 * The set of participants selected by the admin as eligible for one
 * playoff session (the players tied at finalPosition = 1). Recorded
 * once, at session creation, so which players are eligible is never
 * ambiguous while entering hole results.
 */
export const playoffParticipants = pgTable(
  "playoff_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    playoffSessionId: uuid("playoff_session_id")
      .notNull()
      .references(() => playoffSessions.id, { onDelete: "cascade" }),

    championshipPlayerId: uuid("championship_player_id")
      .notNull()
      .references(() => championshipPlayers.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("playoff_participants_session_player_unique_idx").on(
      table.playoffSessionId,
      table.championshipPlayerId
    ),
  ]
);

/**
 * One sudden-death playoff hole within a session, in sequence order
 * (1, 2, 3, ...). A hole is "resolved" once every eligible participant
 * has a recorded score (see `playoff_hole_scores`) — resolution
 * (unique lowest score vs. tie) is computed by
 * src/lib/tournament/playoff.ts, not stored redundantly here.
 */
export const playoffHoles = pgTable(
  "playoff_holes",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    playoffSessionId: uuid("playoff_session_id")
      .notNull()
      .references(() => playoffSessions.id, { onDelete: "cascade" }),

    sequenceNumber: integer("sequence_number").notNull(),

    createdByMemberId: uuid("created_by_member_id").references(
      () => members.id,
      { onDelete: "set null" }
    ),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("playoff_holes_session_sequence_unique_idx").on(
      table.playoffSessionId,
      table.sequenceNumber
    ),
  ]
);

/**
 * One playoff participant's integer stroke score on one playoff hole.
 * Deliberately a separate table from `hole_scores` — this is
 * sudden-death playoff data, never part of the 72-hole stroke-play
 * scoring, and must never be read by handicap/leaderboard/history logic.
 */
export const playoffHoleScores = pgTable(
  "playoff_hole_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    playoffHoleId: uuid("playoff_hole_id")
      .notNull()
      .references(() => playoffHoles.id, { onDelete: "cascade" }),

    championshipPlayerId: uuid("championship_player_id")
      .notNull()
      .references(() => championshipPlayers.id, { onDelete: "cascade" }),

    grossScore: integer("gross_score").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("playoff_hole_scores_hole_player_unique_idx").on(
      table.playoffHoleId,
      table.championshipPlayerId
    ),
  ]
);

export type PlayoffSession = typeof playoffSessions.$inferSelect;
export type NewPlayoffSession = typeof playoffSessions.$inferInsert;
export type PlayoffParticipant = typeof playoffParticipants.$inferSelect;
export type NewPlayoffParticipant = typeof playoffParticipants.$inferInsert;
export type PlayoffHole = typeof playoffHoles.$inferSelect;
export type NewPlayoffHole = typeof playoffHoles.$inferInsert;
export type PlayoffHoleScore = typeof playoffHoleScores.$inferSelect;
export type NewPlayoffHoleScore = typeof playoffHoleScores.$inferInsert;
