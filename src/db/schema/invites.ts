import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { members } from "./members";

/**
 * Single-use passkey enrollment invites.
 *
 * An ADMIN generates an invite for a specific member; the resulting link
 * (`/enroll/[token]`) is shared with that member out-of-band (e.g. text,
 * email, in person). Visiting the link and completing WebAuthn passkey
 * registration consumes the invite exactly once.
 *
 * Security notes:
 * - Only a SHA-256 hash of the raw token is ever persisted. The raw token
 *   exists solely in the URL shared with the member and is never logged
 *   or stored server-side.
 * - `usedAt` / `revokedAt` are both checked (in addition to `expiresAt`)
 *   before an invite is considered valid, so a consumed or admin-revoked
 *   invite can never be replayed.
 */
export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),

  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),

  tokenHash: text("token_hash").notNull().unique(),

  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),

  createdByMemberId: uuid("created_by_member_id").references(
    () => members.id,
    { onDelete: "set null" }
  ),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
