/**
 * One-off recovery script: generates a fresh passkey enrollment invite
 * for the OWNER, pointed at a caller-supplied base URL.
 *
 * Why this exists: `owner.ts` refuses to run once the owner already has
 * a registered passkey (by design, for the very first bootstrap). This
 * script is for the specific recovery case where the owner's existing
 * passkey was registered against the wrong origin (e.g. `localhost`)
 * and is therefore unusable in production — WebAuthn credentials are
 * bound to the exact origin they were created on. It does not touch or
 * revoke the existing (unusable) passkey row; it simply issues a new
 * single-use invite so the owner can register a second, correctly-scoped
 * passkey. No auth/business logic is changed.
 *
 * Usage:
 *
 *   BASE_URL=https://scar-golf.vercel.app npx tsx -r dotenv/config src/db/bootstrap/re-enroll-owner.ts
 */
import { eq, and } from "drizzle-orm";
import { scriptDb as db } from "@/db/script-client";
import { members } from "@/db/schema/members";
import {
  createEnrollmentInviteWithDb,
  revokeOutstandingInvitesForMemberWithDb,
} from "@/lib/invites-core";

async function main() {
  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    console.error(
      "BASE_URL is not set. Example: BASE_URL=https://scar-golf.vercel.app npx tsx -r dotenv/config src/db/bootstrap/re-enroll-owner.ts"
    );
    process.exit(1);
  }

  const owners = await db
    .select()
    .from(members)
    .where(and(eq(members.isOwner, true), eq(members.status, "ACTIVE")));

  if (owners.length !== 1) {
    console.error(
      `Aborted: expected exactly one ACTIVE owner, found ${owners.length}.`
    );
    process.exit(1);
  }

  const owner = owners[0];

  await revokeOutstandingInvitesForMemberWithDb(db, owner.id);

  const { rawToken, invite } = await createEnrollmentInviteWithDb(db, {
    memberId: owner.id,
    createdByMemberId: null,
  });

  const url = `${baseUrl}/enroll/${rawToken}`;

  console.log("");
  console.log("NEW OWNER ENROLLMENT LINK (production)");
  console.log("=======================================");
  console.log(`Member:  ${owner.displayName}`);
  console.log(`Expires: ${invite.expiresAt.toISOString()}`);
  console.log(`URL:     ${url}`);
  console.log("");
  console.log(
    "Open this link on the device/browser you want to use in production, and register a new passkey there."
  );

  process.exit(0);
}

main().catch((error) => {
  console.error("Failed:", error);
  process.exit(1);
});
