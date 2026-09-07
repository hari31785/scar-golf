import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/current-member";
import { getCurrentGroupForMember } from "@/lib/tournament/current-group";
import { AppHeader } from "@/components/dashboard/app-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { getInitials } from "@/lib/members";
import { ScoreEntryClient } from "./score-entry-client";
import { Flag } from "lucide-react";

export default async function ScoreEntryPage() {
  const current = await getCurrentMember();
  if (!current) {
    redirect("/sign-in");
  }
  const { member } = current;

  const result = await getCurrentGroupForMember(member.id);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/30">
      <AppHeader
        greetingName={member.firstName}
        initials={getInitials(member.firstName, member.lastName)}
        isAdmin={member.appRole === "ADMIN"}
      />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-0 pb-28 pt-0">
        {result.state === "found" ? (
          <ScoreEntryClient initialData={result} currentMemberId={member.id} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-card px-6 py-16 text-center ring-1 ring-foreground/10 mx-5 mt-5">
            <Flag className="mb-2 size-8 text-emerald-800/60" />
            <h2 className="text-base font-semibold text-foreground">
              No round to score right now
            </h2>
            <p className="max-w-xs text-sm text-muted-foreground">
              Head back to the Score tab for details.
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
