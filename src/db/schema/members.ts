import {
  boolean,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  text,
} from "drizzle-orm/pg-core";
import { user as authUser } from "./auth";

/**
 * Membership type for a golf club member.
 * PERMANENT members hold a full/standing membership.
 * ASSOCIATE members hold a secondary/limited membership.
 */
export const membershipTypeEnum = pgEnum("membership_type", [
  "PERMANENT",
  "ASSOCIATE",
]);

/**
 * Application-level role, separate from club membership type.
 * PLAYER is the default role for all members.
 * ADMIN grants access to administrative tooling.
 */
export const appRoleEnum = pgEnum("app_role", ["PLAYER", "ADMIN"]);

/**
 * Lifecycle status of a member record.
 * Members are never deleted — they are marked INACTIVE instead,
 * preserving historical championship/scoring data.
 */
export const memberStatusEnum = pgEnum("member_status", [
  "ACTIVE",
  "INACTIVE",
]);

/**
 * Core member/golfer record.
 *
 * Note: this table intentionally holds only club/member identity data.
 * Authentication-specific tables (sessions, tokens, etc.) should live
 * separately and reference `members.email` / `members.id`, keeping auth
 * concerns decoupled from golf/member data.
 */
export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    displayName: varchar("display_name", { length: 150 }).notNull(),

    // Used as the passwordless login allowlist (email-match fallback) and
    // as the identity anchor for enrollment invites.
    email: varchar("email", { length: 255 }).notNull(),

    // Stable link to the Better Auth `auth.user` row once this member has
    // completed passkey enrollment (or otherwise signed in). Nullable
    // because members exist before they ever authenticate. Preferred over
    // matching on email for all authorization checks once populated.
    authUserId: text("auth_user_id").references(() => authUser.id, {
      onDelete: "set null",
    }),

    membershipType: membershipTypeEnum("membership_type").notNull(),
    appRole: appRoleEnum("app_role").notNull().default("PLAYER"),
    status: memberStatusEnum("status").notNull().default("ACTIVE"),

    // Separate, minimal governance marker — deliberately NOT folded into
    // `appRole`. An owner is still just a PLAYER/ADMIN for authorization
    // purposes (see requireAdminMember); `isOwner` is only consulted by
    // the one-time owner bootstrap script (src/db/bootstrap/owner.ts) to
    // decide who may receive the very first enrollment invite before any
    // admin exists who could otherwise use the normal Create Invite flow.
    // Not editable from any UI yet.
    isOwner: boolean("is_owner").notNull().default(false),

    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("members_email_unique_idx").on(table.email),
    uniqueIndex("members_auth_user_id_unique_idx").on(table.authUserId),
  ]
);

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
