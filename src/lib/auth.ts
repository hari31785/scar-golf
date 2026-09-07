import "server-only";

import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { passkey } from "@better-auth/passkey";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import { user, session, account, verification, passkey as passkeyTable } from "@/db/schema/auth";
import { members } from "@/db/schema/members";
import { findActiveMemberByEmail, normalizeEmail } from "@/lib/members";
import { validateInviteToken, markInviteUsed } from "@/lib/invites";

// NOTE: Email-OTP sign-in (via the `emailOTP` Better Auth plugin and
// Resend, see src/lib/email/send-otp.ts) has been retired from the active
// product. Passkeys + admin-issued enrollment links are now the only way
// to authenticate. The OTP plugin/email code is intentionally left in
// place but is NOT imported here and NOT reachable from any UI — no
// Resend environment variables are required for the app to start.

/**
 * Better Auth instance.
 *
 * Access model (important):
 * - There is no public sign-up UI and no password/email-OTP sign-in.
 *   Access is controlled entirely by the SCAR `members` allowlist:
 *   an ADMIN must generate a single-use enrollment invite (see
 *   src/lib/invites.ts) for a specific ACTIVE member before that member
 *   can ever register a passkey and sign in.
 *
 * - `databaseHooks.user.create.before` below is a defense-in-depth gate:
 *   even if a Better Auth `user` row creation were somehow triggered for
 *   an email that isn't (still) an ACTIVE SCAR member, it would be
 *   refused. In practice, the passkey `afterVerification` flow already
 *   independently re-validates the invite before ever provisioning a user
 *   (see `linkMemberToAuthUser` below) — this hook is an extra backstop.
 *
 * - Even when a Better Auth `user`/session exists, that alone never grants
 *   app access after sign-in either: src/lib/current-member.ts re-checks
 *   the SCAR `members` table on every authenticated request, so
 *   deactivating a member immediately revokes access even if they still
 *   possess a valid passkey.
 *
 * Passkey enrollment (primary — and only — auth method):
 * - There is no public passkey registration. An ADMIN generates a
 *   single-use enrollment invite (see src/lib/invites.ts) for a specific
 *   ACTIVE member; the resulting `/enroll/[token]` link is the only way to
 *   register a passkey. The raw invite token is passed through the
 *   passkey plugin's `context` parameter, validated in `resolveUser`
 *   (before the WebAuthn ceremony) and re-validated in `afterVerification`
 *   (after it, right before the passkey row / Better Auth user / session
 *   are persisted) — see `linkMemberToAuthUser` below.
 * - Members are linked to their Better Auth `user` row via the stable
 *   `members.authUserId` column (populated on first successful
 *   enrollment), not by re-matching email on every request. Email is only
 *   used as a fallback/bootstrap key when `authUserId` is not yet set.
 */

/**
 * Resolves (or, on first enrollment, creates) the Better Auth `user` row
 * linked to a SCAR member, and records that link on `members.authUserId`.
 *
 * This is the single place that ever provisions a Better Auth `user` for
 * the passkey flow. It is only ever reached from `afterVerification`,
 * which itself only runs after a valid, unexpired, unused invite for an
 * ACTIVE member has already been re-validated — see `resolveUser` below.
 */
async function linkMemberToAuthUser(member: {
  id: string;
  email: string;
  displayName: string;
  authUserId: string | null;
}): Promise<{ id: string }> {
  if (member.authUserId) {
    const existing = await auth.$context.then((ctx) =>
      ctx.internalAdapter.findUserById(member.authUserId as string)
    );
    if (existing) return existing;
  }

  // Bootstrap fallback: an OTP-era sign-in may have already created a
  // Better Auth user for this email before authUserId linking existed.
  const normalizedEmail = normalizeEmail(member.email);
  const existingByEmail = await auth.$context.then((ctx) =>
    ctx.internalAdapter.findUserByEmail(normalizedEmail)
  );

  let authUser = existingByEmail?.user;
  if (!authUser) {
    authUser = await auth.$context.then((ctx) =>
      ctx.internalAdapter.createUser(
        {
          email: normalizedEmail,
          name: member.displayName,
          emailVerified: true,
        },
        { method: "passkey" }
      )
    );
  }
  const linkedAuthUser = authUser;
  if (!linkedAuthUser) {
    throw new APIError("INTERNAL_SERVER_ERROR", {
      message: "Failed to resolve or create the linked auth user.",
    });
  }

  await db
    .update(members)
    .set({ authUserId: linkedAuthUser.id })
    .where(eq(members.id, member.id));

  return { id: linkedAuthUser.id };
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,

  database: drizzleAdapter(db, {
    provider: "pg",
    schemaName: "auth",
    schema: { user, session, account, verification, passkey: passkeyTable },
  }),

  session: {
    // Keep session lookups honest — always confirm membership status
    // server-side (see current-member.ts) rather than trusting a cached
    // client session for anything access-sensitive.
    cookieCache: {
      enabled: false,
    },
  },

  databaseHooks: {
    user: {
      create: {
        // Defense in depth: refuse to create a Better Auth `user` row for
        // any email that isn't (still) an ACTIVE SCAR member, no matter
        // how the creation was triggered. This is what makes it safe to
        // allow Better Auth's normal first-sign-in provisioning (see
        // `disableSignUp: false` below) without weakening the allowlist.
        async before(user) {
          const member = await findActiveMemberByEmail(user.email);
          if (!member) {
            return false;
          }
        },
      },
    },
  },

  plugins: [
    passkey({
      rpName: "SCAR Championship",

      registration: {
        // No Better Auth session exists yet during invite-based enrollment
        // — resolution happens entirely via the invite token.
        requireSession: false,

        // Runs BEFORE the WebAuthn ceremony starts. Validates the invite
        // token (passed as `context` from the client) and supplies a
        // placeholder identity for the credential-creation options. This
        // is intentionally NOT yet a real Better Auth user id — see
        // `afterVerification`, which re-validates and resolves the real
        // linked user after the ceremony succeeds.
        async resolveUser({ context }) {
          const token = context ?? "";
          const valid = await validateInviteToken(token);
          if (!valid) {
            throw new APIError("BAD_REQUEST", {
              message: "This enrollment link is invalid or has expired.",
            });
          }

          return {
            id: valid.member.id,
            name: valid.member.email,
            displayName: valid.member.displayName,
          };
        },

        // Runs AFTER a successful WebAuthn registration verification.
        // Re-validates the invite (defense in depth against races/replay),
        // resolves or creates the real Better Auth user for this member,
        // links `members.authUserId`, and consumes the invite exactly
        // once. Returning `userId` here redirects the just-created
        // passkey to that real user, which is required for `createSession`
        // to succeed.
        async afterVerification({ context }) {
          const token = context ?? "";
          const valid = await validateInviteToken(token);
          if (!valid) {
            throw new APIError("BAD_REQUEST", {
              message: "This enrollment link is invalid or has expired.",
            });
          }

          const linked = await linkMemberToAuthUser(valid.member);
          await markInviteUsed(valid.invite.id);

          return { userId: linked.id, name: valid.member.displayName };
        },
      },
    }),

    // Must be listed last: ensures session cookies are set correctly from
    // Next.js server actions / route handlers.
    nextCookies(),
  ],
});
