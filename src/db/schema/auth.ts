import {
  boolean,
  integer,
  pgSchema,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Better Auth's internal tables live in their own Postgres schema ("auth"),
 * intentionally kept separate from SCAR's golf/member data (public schema).
 *
 * These tables are managed by Better Auth itself (user identity + sessions
 * + verification tokens). They are NOT the source of truth for club
 * membership — that remains `public.members`. A row existing here only
 * means "this email has an authentication identity"; it does not by itself
 * grant access to the app. Access is (re-)confirmed on every request by
 * checking that the corresponding `members` row is ACTIVE (see
 * src/lib/current-member.ts).
 */
export const authSchema = pgSchema("auth");

export const user = authSchema.table("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const session = authSchema.table("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

// Kept for Better Auth core-schema compatibility. Unused while the app only
// supports passwordless email OTP sign-in (no OAuth providers, no
// passwords), so this table is expected to stay empty for now.
export const account = authSchema.table("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const verification = authSchema.table("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * WebAuthn/passkey credentials, managed by the `@better-auth/passkey`
 * plugin. A single member/user may register multiple passkeys (e.g. one
 * per device — iPhone, MacBook, iPad); nothing here limits that.
 *
 * Column shape mirrors the plugin's expected `passkey` model fields
 * exactly (see @better-auth/passkey's schema.ts) so the plugin can read
 * and write this table via the configured Drizzle adapter.
 */
export const passkey = authSchema.table("passkey", {
  id: text("id").primaryKey(),
  name: text("name"),
  publicKey: text("public_key").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  credentialID: text("credential_id").notNull(),
  counter: integer("counter").notNull(),
  deviceType: text("device_type").notNull(),
  backedUp: boolean("backed_up").notNull(),
  transports: text("transports"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  aaguid: text("aaguid"),
});
