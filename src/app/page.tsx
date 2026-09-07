import { redirect } from "next/navigation";
import { AppHeader } from "@/components/dashboard/app-header";
import { ChampionshipCard } from "@/components/dashboard/championship-card";
import { LeaderboardPreview } from "@/components/dashboard/leaderboard-preview";
import { StatCard } from "@/components/dashboard/stat-card";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import {
  currentChampionship,
  currentUser,
  leaderboardPreview,
} from "@/lib/mock-data";
import { Target, Award } from "lucide-react";
import { getCurrentMember } from "@/lib/current-member";
import { getInitials } from "@/lib/members";

export default async function Home() {
  const current = await getCurrentMember();
  if (!current) {
    redirect("/sign-in");
  }

  // `current.member.appRole` (PLAYER | ADMIN) is resolved server-side here
  // and controls whether the Admin nav link is shown. This is a UI
  // convenience only — the real authorization boundary is enforced
  // server-side in /admin/members and every admin server action.
  const { member } = current;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/30">
      <AppHeader
        greetingName={member.firstName}
        initials={getInitials(member.firstName, member.lastName)}
        isAdmin={member.appRole === "ADMIN"}
      />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 pb-28 pt-5">
        <ChampionshipCard
          name={currentChampionship.name}
          round={currentChampionship.round}
          totalRounds={currentChampionship.totalRounds}
          teeTime={currentChampionship.teeTime}
          groupNumber={currentChampionship.groupNumber}
          course={currentChampionship.course}
        />

        <div className="flex gap-3">
          <StatCard
            label="Handicap"
            value={currentUser.handicap.toFixed(1)}
            subtext="Current index"
            icon={Target}
          />
          <StatCard
            label="Championships"
            value={String(currentUser.championshipsPlayed)}
            subtext="Played to date"
            icon={Award}
          />
        </div>

        <LeaderboardPreview players={leaderboardPreview} />
      </main>

      <BottomNav />
    </div>
  );
}
