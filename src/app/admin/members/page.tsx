import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/current-member";
import { listAdminMembers } from "@/lib/admin/members-data";
import { AdminMembersView } from "@/components/admin/admin-members-view";

export const metadata: Metadata = {
  title: "Admin · Members · SCAR Championship",
};

export default async function AdminMembersPage() {
  const current = await getCurrentMember();

  if (!current) {
    redirect("/sign-in");
  }

  // Server-side authorization boundary: PLAYER members are redirected away
  // even if they navigate here directly by URL. This mirrors (and backs
  // up) the "hide the Admin nav item" behavior in the UI — the real
  // enforcement lives here and in every admin server action.
  if (current.member.appRole !== "ADMIN") {
    redirect("/");
  }

  const members = await listAdminMembers();

  return <AdminMembersView members={members} />;
}
