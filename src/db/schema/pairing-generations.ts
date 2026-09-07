import { jsonb, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { championshipRounds } from "./championship-rounds";
import { members } from "./members";

/**
 * How a set of pairings for a round was produced.
 * INITIAL — Round 1's manual/membership-based pairing.
 * NET_STANDINGS — Rounds 2-4, generated from cumulative net standings.
 * MANUAL_OVERRIDE — an admin manually adjusted the generated pairings.
 */
export const pairingGenerationTypeEnum = pgEnum("pairing_generation_type", [
  "INITIAL",
  "NET_STANDINGS",
  "MANUAL_OVERRIDE",
]);

/**
 * An audit/transparency record of one pairing-generation event for a
 * championship round. Does not itself define the groups (see
 * round_groups / round_group_players) — this table exists purely so we
 * can later explain HOW and WHY a given round's pairings were produced
 * (e.g. what the standings looked like at generation time).
 */
export const pairingGenerations = pgTable("pairing_generations", {
  id: uuid("id").primaryKey().defaultRandom(),

  championshipRoundId: uuid("championship_round_id")
    .notNull()
    .references(() => championshipRounds.id, { onDelete: "cascade" }),

  generationType: pairingGenerationTypeEnum("generation_type").notNull(),

  generatedByMemberId: uuid("generated_by_member_id").references(
    () => members.id,
    { onDelete: "set null" }
  ),

  // Free-form snapshot of the standings used to produce this pairing
  // generation (e.g. cumulative net per player at generation time).
  // Shape intentionally left to the future pairing service to define.
  standingsSnapshot: jsonb("standings_snapshot"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type PairingGeneration = typeof pairingGenerations.$inferSelect;
export type NewPairingGeneration = typeof pairingGenerations.$inferInsert;
