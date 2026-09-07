import {
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { members } from "./members";

/**
 * Lifecycle status of a SCAR championship.
 * DRAFT — created, players may be enrolled/removed, handicaps not frozen.
 * ACTIVE — started; participant handicaps frozen; rounds are underway.
 * COMPLETED — all 4 rounds finished; championMemberId set.
 * CANCELLED — abandoned; never contributes to any standings/history.
 */
export const championshipStatusEnum = pgEnum("championship_status", [
  "DRAFT",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
]);

/**
 * One annual SCAR Championship (stroke play, 4 rounds of 18, each
 * player plays their own ball, champion = lowest cumulative NET after 4
 * rounds).
 *
 * Only one non-cancelled championship per `year` is allowed (see the
 * partial unique index below) — CANCELLED championships are excluded so
 * a cancelled attempt doesn't permanently block that year from being
 * re-run.
 */
export const championships = pgTable(
  "championships",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    year: integer("year").notNull(),
    name: varchar("name", { length: 200 }).notNull(),

    status: championshipStatusEnum("status").notNull().default("DRAFT"),

    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),

    // Set only once the championship is COMPLETED. Nullable until then.
    championMemberId: uuid("champion_member_id").references(
      () => members.id,
      { onDelete: "set null" }
    ),

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
    // Partial unique index: only one non-cancelled championship per year.
    // Drizzle doesn't yet expose a first-class `.where()` on
    // uniqueIndex() in this version, so this is enforced instead by the
    // tournament creation service (see src/lib/tournament/create.ts),
    // which checks for an existing non-cancelled championship for the
    // requested year inside the same transaction before inserting.
    uniqueIndex("championships_year_idx").on(table.year),
  ]
);

export type Championship = typeof championships.$inferSelect;
export type NewChampionship = typeof championships.$inferInsert;
