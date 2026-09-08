"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { members } from "@/db/schema/members";
import { requireAdminMember } from "@/lib/current-member";
import { normalizeEmail } from "@/lib/normalize-email";

export type MembersActionResult = { ok: true } | { ok: false; error: string };

/**
 * Admin-only: creates a new SCAR member record only — no Better Auth
 * user, passkey, or invite is created here. The existing enrollment
 * flow (Create Invite, see src/lib/admin/actions.ts) is how the member
 * later sets up authentication. `authUserId` starts null, exactly like
 * every member created any other way.
 *
 * Email is required because `members.email` is a NOT NULL, unique
 * column (used as the enrollment/allowlist identity anchor) — this is
 * an existing schema constraint, not a new requirement introduced here.
 */
export async function addMemberAction(params: {
  firstName: string;
  lastName: string;
  email: string;
  membershipType: "PERMANENT" | "ASSOCIATE";
  appRole: "PLAYER" | "ADMIN";
}): Promise<MembersActionResult> {
  try {
    await requireAdminMember();

    const firstName = params.firstName.trim();
    const lastName = params.lastName.trim();
    const email = normalizeEmail(params.email);

    if (!firstName || !lastName) {
      return { ok: false, error: "First and last name are required." };
    }
    if (!email) {
      return { ok: false, error: "A valid email is required." };
    }

    const [existing] = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.email, email))
      .limit(1);
    if (existing) {
      return { ok: false, error: "A member with this email already exists." };
    }

    await db.insert(members).values({
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`,
      email,
      membershipType: params.membershipType,
      appRole: params.appRole,
      status: "ACTIVE",
      joinedAt: new Date(),
    });

    revalidatePath("/admin/members");
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't add the member. Please try again." };
  }
}

/**
 * Admin-only: changes a member's email address. Editable for every
 * member (not just unenrolled ones) — enforces the same NOT
 * NULL/unique constraint as `addMemberAction`.
 */
export async function updateEmailAction(params: {
  memberId: string;
  email: string;
}): Promise<MembersActionResult> {
  try {
    await requireAdminMember();

    const email = normalizeEmail(params.email);
    if (!email) {
      return { ok: false, error: "A valid email is required." };
    }

    const [existing] = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.email, email))
      .limit(1);
    if (existing && existing.id !== params.memberId) {
      return { ok: false, error: "A member with this email already exists." };
    }

    await db
      .update(members)
      .set({ email, updatedAt: new Date() })
      .where(eq(members.id, params.memberId));
    revalidatePath("/admin/members");
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't update the email." };
  }
}

/** Admin-only: changes a member's membership type (Permanent/Associate). */
export async function updateMembershipTypeAction(params: {
  memberId: string;
  membershipType: "PERMANENT" | "ASSOCIATE";
}): Promise<MembersActionResult> {
  try {
    await requireAdminMember();
    await db
      .update(members)
      .set({ membershipType: params.membershipType, updatedAt: new Date() })
      .where(eq(members.id, params.memberId));
    revalidatePath("/admin/members");
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't update membership type." };
  }
}

/**
 * Admin-only: changes a member's app role (Player/Admin).
 *
 * Owner protection: the sole OWNER member can never be demoted away
 * from ADMIN, even by another admin — enforced here regardless of
 * what the UI shows.
 */
export async function updateAppRoleAction(params: {
  memberId: string;
  appRole: "PLAYER" | "ADMIN";
}): Promise<MembersActionResult> {
  try {
    await requireAdminMember();

    const [target] = await db
      .select({ isOwner: members.isOwner })
      .from(members)
      .where(eq(members.id, params.memberId))
      .limit(1);

    if (target?.isOwner && params.appRole !== "ADMIN") {
      return { ok: false, error: "The owner must remain an Admin." };
    }

    await db
      .update(members)
      .set({ appRole: params.appRole, updatedAt: new Date() })
      .where(eq(members.id, params.memberId));
    revalidatePath("/admin/members");
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't update the app role." };
  }
}

/**
 * Admin-only: activates or deactivates a member.
 *
 * Owner protection: the sole OWNER member can never be deactivated,
 * even by another admin — enforced here regardless of what the UI
 * shows. Deactivating is a status flip only; no dependent rows
 * (championship history, played rounds, etc.) are touched.
 */
export async function setMemberStatusAction(params: {
  memberId: string;
  status: "ACTIVE" | "INACTIVE";
}): Promise<MembersActionResult> {
  try {
    await requireAdminMember();

    const [target] = await db
      .select({ isOwner: members.isOwner })
      .from(members)
      .where(eq(members.id, params.memberId))
      .limit(1);

    if (target?.isOwner && params.status === "INACTIVE") {
      return { ok: false, error: "The owner cannot be deactivated." };
    }

    await db
      .update(members)
      .set({ status: params.status, updatedAt: new Date() })
      .where(eq(members.id, params.memberId));
    revalidatePath("/admin/members");
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't update member status." };
  }
}
