import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/current-member";
import { getLeaderboardPageData } from "@/lib/tournament/leaderboard";
import { AppHeader } from "@/components/dashboard/app-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { getInitials } from "@/lib/members";
import { PageHero } from "@/components/dashboard/page-hero";
import { LeaderboardClient } from "./leaderboard-client";
import { Trophy } from "lucide-react";

export default async function LeaderboardPage() {
  const current = await getCurrentMember();
  if (!current) {
    redirect("/sign-in");
  }
  const { member } = current;

  const data = await getLeaderboardPageData();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/30">
      <AppHeader
        greetingName={member.firstName}
        initials={getInitials(member.firstName, member.lastName)}
        isAdmin={member.appRole === "ADMIN"}
      />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-0 pb-28 pt-0">
        <div className="px-5 pt-4">
          <PageHero title="Leaderboard" />
        </div>
        {data.state === "found" ? (
          <LeaderboardClient initialData={data} currentMemberId={member.id} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-card px-6 py-16 text-center ring-1 ring-foreground/10 mx-5 mt-5">
            <Trophy className="mb-2 size-8 text-emerald-800/60" />
            <h2 className="text-base font-semibold text-foreground">
              No active championship right now
            </h2>
            <p className="max-w-xs text-sm text-muted-foreground">
              Check back once a championship is underway to see the live leaderboard.
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
