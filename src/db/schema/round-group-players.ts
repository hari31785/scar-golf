import { integer, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { roundGroups } from "./round-groups";
import { championshipRounds } from "./championship-rounds";
import { championshipPlayers } from "./championship-players";

/**
 * Membership of one championship participant within one group, for one
 * round. `position` is the order within the group (e.g. tee-off order),
 * purely for display — not used in any scoring calculation.
 *
 * A championship player may only appear in ONE group per round. This is
 * enforced at the database level via a denormalized `championshipRoundId`
 * column (kept in sync with the parent `roundGroups.championshipRoundId`
 * by the pairing service — a future phase — inside the same transaction
 * that inserts the row) plus a unique index on
 * (championshipRoundId, championshipPlayerId). Without this
 * denormalization, uniqueness on (roundGroupId, championshipPlayerId)
 * alone would NOT prevent the same player being placed in two different
 * groups within the same round, since those are different roundGroupId
 * values.
 */
export const roundGroupPlayers = pgTable(
  "round_group_players",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    roundGroupId: uuid("round_group_id")
      .notNull()
      .references(() => roundGroups.id, { onDelete: "cascade" }),

    // Denormalized from roundGroups.championshipRoundId — see module
    // doc comment above. Required for the cross-group uniqueness
    // constraint below.
    championshipRoundId: uuid("championship_round_id")
      .notNull()
      .references(() => championshipRounds.id, { onDelete: "cascade" }),

    championshipPlayerId: uuid("championship_player_id")
      .notNull()
      .references(() => championshipPlayers.id, { onDelete: "cascade" }),

    position: integer("position").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Prevents the same championship player from appearing in two
    // DIFFERENT groups within the same round.
    uniqueIndex("round_group_players_round_player_unique_idx").on(
      table.championshipRoundId,
      table.championshipPlayerId
    ),
  ]
);

export type RoundGroupPlayer = typeof roundGroupPlayers.$inferSelect;
export type NewRoundGroupPlayer = typeof roundGroupPlayers.$inferInsert;
