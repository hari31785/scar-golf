/**
 * Seed script for the initial SCAR member list.
 *
 * Members whose `email` still starts with "REPLACE_ME_" are SKIPPED (no
 * row is created or touched for them) — only entries with a real email
 * are seeded. This lets you seed members incrementally as real email
 * addresses become available; just replace a placeholder and re-run.
 *
 * Usage:
 *
 *   npm run db:seed
 *
 * Idempotent: matched by normalized (lowercased/trimmed) email. If a
 * member already exists, their firstName/lastName/displayName/
 * membershipType/appRole/status/joinedAt are updated to match this file
 * rather than creating a duplicate row.
 *
 * IMPORTANT: this script only ever writes to `public.members` — SCAR's
 * authoritative member allowlist. It intentionally does NOT create or
 * touch Better Auth's `auth.user` table. Better Auth user/session/account
 * records are created by Better Auth itself during the real
 * authentication flow (email OTP sign-in), never pre-provisioned here.
 * Being a SCAR member does not, by itself, create an auth identity.
 *
 * Only member names and insert/update/skip outcomes are logged — never
 * full email addresses or credentials.
 */
import { scriptDb as db } from "@/db/script-client";
import { members, type NewMember } from "@/db/schema/members";
import { normalizeEmail } from "@/lib/normalize-email";
import { eq } from "drizzle-orm";

const PLACEHOLDER_PREFIX = "REPLACE_ME_";

type SeedMember = {
  firstName: string;
  lastName: string;
  membershipType: "PERMANENT" | "ASSOCIATE";
  /**
   * 👉 Set exactly this field to "ADMIN" for whichever member(s) should
   * have admin access. Everyone else should stay "PLAYER". Nothing else
   * needs to change to designate an admin.
   */
  appRole: "PLAYER" | "ADMIN";
  /**
   * 👉 Only ever true for a single member (currently Hari Kurada). Separate
   * from `appRole` — this is a governance marker consulted only by the
   * one-time owner bootstrap script, not by normal authorization checks.
   */
  isOwner?: boolean;
  /**
   * 👉 REPLACE with the member's real email address before running.
   */
  email: string;
};

const seedMembers: SeedMember[] = [
  // --- Permanent members ---
  {
    firstName: "Srikanth",
    lastName: "Mamidala",
    membershipType: "PERMANENT",
    appRole: "PLAYER",
    email: "mamidala86@gmail.com",
  },
  {
    firstName: "Chandra Teja",
    lastName: "Reddy",
    membershipType: "PERMANENT",
    appRole: "PLAYER",
    email: "chandrateja7@gmail.com",
  },
  {
    firstName: "Adithya",
    lastName: "Bommaraju",
    membershipType: "PERMANENT",
    appRole: "PLAYER",
    email: `${PLACEHOLDER_PREFIX}adithya.bommaraju@example.com`,
  },
  {
    firstName: "Rahul",
    lastName: "Gollapudi",
    membershipType: "PERMANENT",
    appRole: "ADMIN",
    email: "graul09@gmail.com",
  },

  // --- Associate members ---
  {
    firstName: "George",
    lastName: "Thomas",
    membershipType: "ASSOCIATE",
    appRole: "PLAYER",
    email: `${PLACEHOLDER_PREFIX}george.thomas@example.com`,
  },
  {
    firstName: "Deepak",
    lastName: "Bommaraju",
    membershipType: "ASSOCIATE",
    appRole: "PLAYER",
    email: `${PLACEHOLDER_PREFIX}deepak.bommaraju@example.com`,
  },
  {
    firstName: "Ajay",
    lastName: "Veerapaneni",
    membershipType: "ASSOCIATE",
    appRole: "PLAYER",
    email: "ajayveerapaneni@gmail.com",
  },
  {
    firstName: "Sashi",
    lastName: "Ravipati",
    membershipType: "ASSOCIATE",
    appRole: "PLAYER",
    email: `${PLACEHOLDER_PREFIX}sashi.ravipati@example.com`,
  },
  {
    firstName: "Hari",
    lastName: "Kurada",
    membershipType: "ASSOCIATE",
    appRole: "ADMIN",
    isOwner: true, // 👈 sole OWNER — used only by the bootstrap script
    email: "harikrishna_ksss@yahoo.co.in",
  },
  {
    firstName: "Zachary",
    lastName: "Paradise",
    membershipType: "ASSOCIATE",
    appRole: "PLAYER",
    email: `${PLACEHOLDER_PREFIX}zachary.paradise@example.com`,
  },
];

async function main() {
  const ready = seedMembers.filter(
    (m) => !m.email.startsWith(PLACEHOLDER_PREFIX)
  );
  const skipped = seedMembers.filter((m) =>
    m.email.startsWith(PLACEHOLDER_PREFIX)
  );

  if (skipped.length > 0) {
    console.log(
      `Skipping ${skipped.length} member(s) with placeholder emails (no rows created):`
    );
    for (const m of skipped) {
      console.log(`  ↷ skipped (placeholder email): ${m.firstName} ${m.lastName}`);
    }
    console.log("");
  }

  if (ready.length === 0) {
    console.log("No members with real emails to seed. Exiting.");
    process.exit(0);
  }

  const now = new Date();

  for (const seedMember of ready) {
    const normalizedEmail = normalizeEmail(seedMember.email);
    const displayName = `${seedMember.firstName} ${seedMember.lastName}`;

    const existingMember = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.email, normalizedEmail))
      .limit(1);

    if (existingMember.length === 0) {
      const newMember: NewMember = {
        firstName: seedMember.firstName,
        lastName: seedMember.lastName,
        displayName,
        email: normalizedEmail,
        membershipType: seedMember.membershipType,
        appRole: seedMember.appRole,
        isOwner: seedMember.isOwner ?? false,
        status: "ACTIVE",
        joinedAt: now,
      };
      await db.insert(members).values(newMember);
      console.log(`  ✅ inserted: ${displayName}`);
    } else {
      await db
        .update(members)
        .set({
          firstName: seedMember.firstName,
          lastName: seedMember.lastName,
          displayName,
          membershipType: seedMember.membershipType,
          appRole: seedMember.appRole,
          isOwner: seedMember.isOwner ?? false,
          status: "ACTIVE",
          joinedAt: now,
          updatedAt: now,
        })
        .where(eq(members.email, normalizedEmail));
      console.log(`  ♻️  updated: ${displayName}`);
    }
  }

  console.log(
    `\nSeed complete. ${ready.length} member(s) processed, ${skipped.length} skipped.`
  );
  process.exit(0);
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});

