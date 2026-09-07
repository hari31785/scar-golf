import {
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { championshipRounds } from "./championship-rounds";
import { members } from "./members";

/**
 * Lifecycle status of a single group/foursome within a championship
 * round. A group is SUBMITTED once every participating player in it has
 * a complete 18-hole scorecard (scoring itself is a future phase — this
 * schema only tracks the group-level lifecycle).
 */
export const roundGroupStatusEnum = pgEnum("round_group_status", [
  "NOT_STARTED",
  "IN_PROGRESS",
  "SUBMITTED",
]);

/**
 * A single group/foursome playing together within a championship round.
 * Groups can score in parallel based on tee time. Round 1 groups come
 * from initial/manual membership-based pairing; Rounds 2-4 groups come
 * from net-standings-based pairing (see pairing_generations).
 */
export const roundGroups = pgTable(
  "round_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    championshipRoundId: uuid("championship_round_id")
      .notNull()
      .references(() => championshipRounds.id, { onDelete: "cascade" }),

    groupNumber: integer("group_number").notNull(),

    teeTime: timestamp("tee_time", { withTimezone: true }),

    status: roundGroupStatusEnum("status").notNull().default("NOT_STARTED"),

    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    submittedByMemberId: uuid("submitted_by_member_id").references(
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
    uniqueIndex("round_groups_round_group_number_unique_idx").on(
      table.championshipRoundId,
      table.groupNumber
    ),
  ]
);

export type RoundGroup = typeof roundGroups.$inferSelect;
export type NewRoundGroup = typeof roundGroups.$inferInsert;
