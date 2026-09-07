/**
 * One-time OWNER bootstrap script.
 *
 * Generates the very first passkey enrollment invite — for the sole
 * seeded OWNER (Hari Kurada) — before any ADMIN exists who could
 * otherwise use the normal Admin → Members → Create Invite workflow.
 *
 * This is intentionally a local CLI script, NOT a route: there is no
 * public/bootstrap HTTP endpoint anywhere in the app.
 *
 * Usage:
 *
 *   npm run auth:bootstrap-owner
 *
 * Safeguards (all enforced before anything is created):
 * - Exactly one ACTIVE member with `isOwner = true` must exist. Zero or
 *   more than one is a hard error.
 * - That owner must also have `appRole = "ADMIN"` (OWNER is a separate
 *   governance marker, never a substitute for the real ADMIN check used
 *   everywhere else in the app).
 * - If the owner already has one or more registered passkeys, the script
 *   refuses to run — this is a strictly one-time bootstrap, not a way to
 *   mint additional owner invites.
 * - Any previously-outstanding (unused, unrevoked) invite for the owner
 *   is revoked before the new one is created, so only the latest link is
 *   ever valid.
 *
 * Output discipline:
 * - The raw enrollment URL is printed exactly once, under the banner
 *   "ONE-TIME OWNER ENROLLMENT LINK" — never logged again after this.
 * - No email address is ever printed (only the member's name, which is
 *   already non-sensitive display data used throughout the admin UI).
 * - No session or passkey is created by this script — it only creates an
 *   invite row; the actual passkey is registered by the owner manually
 *   visiting the link.
 */
import { eq, and, sql } from "drizzle-orm";
import { scriptDb as db } from "@/db/script-client";
import { members } from "@/db/schema/members";
import { passkey as passkeyTable } from "@/db/schema/auth";
import {
  createEnrollmentInviteWithDb,
  revokeOutstandingInvitesForMemberWithDb,
} from "@/lib/invites-core";

async function main() {
  const baseUrl = process.env.BETTER_AUTH_URL;
  if (!baseUrl) {
    console.error(
      "BETTER_AUTH_URL is not set. Add it to your .env before running this script."
    );
    process.exit(1);
  }

  const owners = await db
    .select()
    .from(members)
    .where(and(eq(members.isOwner, true), eq(members.status, "ACTIVE")));

  if (owners.length === 0) {
    console.error(
      "Bootstrap aborted: no ACTIVE member has isOwner = true. Nothing to do."
    );
    process.exit(1);
  }
  if (owners.length > 1) {
    console.error(
      `Bootstrap aborted: found ${owners.length} ACTIVE members with isOwner = true. Exactly one owner is required.`
    );
    process.exit(1);
  }

  const owner = owners[0];

  if (owner.appRole !== "ADMIN") {
    console.error(
      `Bootstrap aborted: the owner (${owner.displayName}) does not have appRole = "ADMIN".`
    );
    process.exit(1);
  }

  if (owner.authUserId) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(passkeyTable)
      .where(eq(passkeyTable.userId, owner.authUserId));

    if (count > 0) {
      console.error(
        `Bootstrap aborted: ${owner.displayName} already has ${count} registered passkey(s). ` +
          "This script only ever generates the very first owner enrollment link."
      );
      process.exit(1);
    }
  }

  // Enforce "only the latest invite is ever valid", same policy as the
  // normal admin Create Invite flow.
  await revokeOutstandingInvitesForMemberWithDb(db, owner.id);

  const { rawToken, invite } = await createEnrollmentInviteWithDb(db, {
    memberId: owner.id,
    createdByMemberId: null,
  });

  const url = `${baseUrl}/enroll/${rawToken}`;

  console.log("");
  console.log("ONE-TIME OWNER ENROLLMENT LINK");
  console.log("==============================");
  console.log(`Member:  ${owner.displayName}`);
  console.log(`Expires: ${invite.expiresAt.toISOString()}`);
  console.log(`URL:     ${url}`);
  console.log("");
  console.log(
    "This link will not be shown again. If lost, re-run this command to generate a new one (only while no passkey exists yet)."
  );

  process.exit(0);
}

main().catch((error) => {
  console.error("Bootstrap failed:", error);
  process.exit(1);
});
