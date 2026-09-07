import {
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { members } from "./members";

/**
 * Where a played-round record came from.
 * HISTORICAL_IMPORT — brought in from the legacy SCAR Excel workbook.
 * CHAMPIONSHIP — recorded directly by the app from an in-progress/played
 * SCAR championship round (future phase).
 */
export const roundSourceEnum = pgEnum("round_source", [
  "HISTORICAL_IMPORT",
  "CHAMPIONSHIP",
]);

/**
 * An immutable record of one real, played SCAR round for one member.
 *
 * Course identity/rating/slope/par are stored as SNAPSHOTS at the time
 * the round was recorded — deliberately NOT normalized into a separate
 * courses table yet (that system will be built separately). This is
 * intentional: editing a course's rating/slope later must never
 * retroactively change the outcome of a historical handicap calculation,
 * since every past round already carries its own frozen values.
 *
 * Rows here are never edited after creation (no `updatedAt`) — they are
 * either real played rounds imported/recorded once, or (in the future)
 * superseded by a corrected re-import performed as a fresh operation.
 *
 * IMPORTANT: this table must only ever contain REAL played rounds.
 * Handicap-calculation "padding" (duplicating a player's best historical
 * round to fill out fewer than 20 actual rounds) is a calculation-time
 * concept only — see src/lib/handicap/calculate.ts — and must never be
 * written here.
 */
export const playedRounds = pgTable(
  "played_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),

    playedAt: date("played_at", { mode: "date" }).notNull(),

    // Course snapshots — see module doc comment above.
    courseName: varchar("course_name", { length: 200 }).notNull(),
    courseCity: varchar("course_city", { length: 200 }),

    grossScore: integer("gross_score").notNull(),
    courseRating: numeric("course_rating", {
      precision: 4,
      scale: 1,
      mode: "number",
    }).notNull(),
    slope: integer("slope").notNull(),
    par: integer("par"),

    source: roundSourceEnum("source").notNull().default("HISTORICAL_IMPORT"),

    // When this row was brought into the system (distinct from `playedAt`,
    // the actual date the round was played). Null for rounds recorded
    // directly (not via a batch import).
    importedAt: timestamp("imported_at", { withTimezone: true }),

    // Opaque reference back to the original source row (e.g. a workbook
    // sheet name + row number) for traceability/debugging re-imports.
    // Deterministic for imported rows (e.g.
    // "historical-import:<workbook>:<sheet>:r<row>") and unique so
    // re-running an import can safely upsert/skip instead of duplicating
    // rows (see src/lib/import). Null for rounds not tied to a batch
    // import.
    sourceRef: text("source_ref"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("played_rounds_member_id_idx").on(table.memberId),
    index("played_rounds_member_played_at_idx").on(
      table.memberId,
      table.playedAt
    ),
    uniqueIndex("played_rounds_source_ref_unique_idx").on(table.sourceRef),
  ]
);

export type PlayedRound = typeof playedRounds.$inferSelect;
export type NewPlayedRound = typeof playedRounds.$inferInsert;
