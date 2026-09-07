import {
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { championships } from "./championships";
import { members, membershipTypeEnum } from "./members";

/**
 * A championship participant's status.
 * ACTIVE — still competing; counts toward round-completion requirements.
 * WITHDRAWN — voluntarily left; must NOT block round completion.
 * DISQUALIFIED — removed for cause; must NOT block round completion.
 */
export const participantStatusEnum = pgEnum("participant_status", [
  "ACTIVE",
  "WITHDRAWN",
  "DISQUALIFIED",
]);

/**
 * A per-championship participant snapshot for one member.
 *
 * CRITICAL INVARIANT: `frozenHandicap` is set exactly once, by the
 * championship start service (src/lib/tournament/start.ts), at the
 * moment the championship transitions DRAFT -> ACTIVE. It must never be
 * recalculated afterward — all 4 rounds are scored against this frozen
 * value, even if the member's live handicap (see
 * src/lib/handicap/service.ts) changes later due to newly played
 * historical or tournament rounds. `frozenHandicap` is nullable only
 * because it genuinely has no value before the championship starts.
 *
 * `membershipTypeSnapshot` is captured at the same moment for the same
 * reason — a member's membership type could theoretically change later
 * (e.g. PERMANENT/ASSOCIATE), but the championship record must reflect
 * what it was AT THE TIME they competed.
 */
export const championshipPlayers = pgTable(
  "championship_players",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    championshipId: uuid("championship_id")
      .notNull()
      .references(() => championships.id, { onDelete: "cascade" }),

    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),

    // Null until the championship starts (see module doc comment).
    // Stored as an integer — the handicap engine's finalHandicap is
    // always a whole number (ROUNDUP already applied, capped).
    frozenHandicap: integer("frozen_handicap"),

    membershipTypeSnapshot: membershipTypeEnum("membership_type_snapshot"),

    participantStatus: participantStatusEnum("participant_status")
      .notNull()
      .default("ACTIVE"),

    // Null until the championship completes.
    finalPosition: integer("final_position"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("championship_players_championship_member_unique_idx").on(
      table.championshipId,
      table.memberId
    ),
  ]
);

export type ChampionshipPlayer = typeof championshipPlayers.$inferSelect;
export type NewChampionshipPlayer = typeof championshipPlayers.$inferInsert;
