import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { validateInviteToken } from "@/lib/invites";
import { EnrollFlow } from "@/components/auth/enroll-flow";
import { getCurrentMember } from "@/lib/current-member";

export const metadata: Metadata = {
  title: "Complete Enrollment · SCAR Championship",
};

export default async function EnrollPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Already signed in? An enrollment link has nothing left to do.
  const current = await getCurrentMember();
  if (current) {
    redirect("/");
  }

  const valid = await validateInviteToken(token);

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-muted/30 px-6 py-16">
      <EnrollFlow
        token={token}
        member={
          valid
            ? {
                displayName: valid.member.displayName,
                firstName: valid.member.firstName,
              }
            : null
        }
      />
    </div>
  );
}
