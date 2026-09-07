import {
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { championshipRounds } from "./championship-rounds";
import { championshipPlayers } from "./championship-players";
import { roundGroups } from "./round-groups";
import { members } from "./members";

/**
 * The immutable record that a championship player's 18-hole scorecard
 * was submitted (as part of their group's "Confirm & Submit Round").
 *
 * This is the authoritative source of truth for "does this ACTIVE
 * participant have a submitted complete scorecard for this round?" —
 * round/group completion logic must query THIS table, never infer it
 * from `round_groups.status` alone (a group's status is a convenient
 * summary, but this table is what proves each individual player's
 * submission, and survives even if a group's own bookkeeping were ever
 * wrong).
 *
 * A row here is created exactly once per (round, player) at submission
 * time and is never deleted. Admin corrections (see
 * src/lib/tournament/scoring/correction.ts) update `grossTotal` in
 * place to keep it consistent with corrected authoritative hole scores,
 * but `submittedAt` / `submittedByMemberId` are preserved untouched —
 * a correction does not "re-submit".
 */
export const scorecardSubmissions = pgTable(
  "scorecard_submissions",
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

    submittedByMemberId: uuid("submitted_by_member_id")
      .notNull()
      .references(() => members.id, { onDelete: "set null" }),

    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    // Snapshot of the sum of the 18 hole scores at submission time.
    // Kept up to date by the admin correction service after any
    // correction (see module doc comment above) so it always reflects
    // the current authoritative total.
    grossTotal: integer("gross_total").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One current/original submission per (round, player) — a second
    // submission attempt for the same player/round must be rejected or
    // treated as a no-op by the service layer, never create a second row.
    uniqueIndex("scorecard_submissions_round_player_unique_idx").on(
      table.championshipRoundId,
      table.championshipPlayerId
    ),
  ]
);

export type ScorecardSubmission = typeof scorecardSubmissions.$inferSelect;
export type NewScorecardSubmission = typeof scorecardSubmissions.$inferInsert;
