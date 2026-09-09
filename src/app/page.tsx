import { redirect } from "next/navigation";
import { Playfair_Display } from "next/font/google";
import { AppHeader } from "@/components/dashboard/app-header";
import { ChampionshipCard } from "@/components/dashboard/championship-card";
import { LeaderboardPreview } from "@/components/dashboard/leaderboard-preview";
import { StatCard } from "@/components/dashboard/stat-card";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { GolfHeroBanner } from "@/components/dashboard/golf-hero-banner";
import { BrandQuoteCard } from "@/components/dashboard/brand-quote-card";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { Target, Flag } from "lucide-react";
import { getCurrentMember } from "@/lib/current-member";
import { getInitials } from "@/lib/members";
import { calculateHandicapForMember } from "@/lib/handicap/service";
import { getCurrentGroupForMember } from "@/lib/tournament/current-group";
import { getLeaderboardPageData } from "@/lib/tournament/leaderboard";
import { getMemberChampionshipYears } from "@/lib/tournament/history";
import { ChampionshipsPlayedCard } from "@/components/dashboard/championships-played-card";
import { formatTeeTime } from "@/lib/format-date";

const displaySerif = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-scar-display",
});

function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function CardEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-card px-6 py-10 text-center ring-1 ring-foreground/10">
      <Flag className="mb-1 size-6 text-emerald-800/60" />
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="max-w-xs text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

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

  const [handicapResult, groupResult, leaderboardData, championshipYears] =
    await Promise.all([
      calculateHandicapForMember(member.id),
      getCurrentGroupForMember(member.id),
      getLeaderboardPageData(),
      getMemberChampionshipYears(member.id),
    ]);

  const topThree =
    leaderboardData.state === "found"
      ? leaderboardData.entries.slice(0, 3).map((entry) => ({
          id: entry.championshipPlayerId,
          name: entry.displayName,
          initials: initialsFromDisplayName(entry.displayName),
          score: String(entry.cumulativeNet),
          position: entry.position,
        }))
      : [];

  return (
    <div
      className={`${displaySerif.variable} flex min-h-full flex-1 flex-col bg-muted/30`}
    >
      <AppHeader
        greetingName={member.firstName}
        initials={getInitials(member.firstName, member.lastName)}
        isAdmin={member.appRole === "ADMIN"}
      />

      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-4 px-5 pt-4 pb-28 lg:gap-5 lg:px-8 lg:pt-6 lg:pb-16">
        <GolfHeroBanner />

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
          <div className="flex flex-col gap-4 lg:w-[62%] lg:gap-5">
            {groupResult.state === "found" ? (
              <ChampionshipCard
                name={`${groupResult.championshipName} ${groupResult.year}`}
                round={groupResult.roundNumber}
                totalRounds={groupResult.totalRounds}
                teeTime={formatTeeTime(groupResult.teeTime) ?? "—"}
                groupNumber={groupResult.groupNumber}
                course={groupResult.courseName ?? "Course TBD"}
              />
            ) : groupResult.state === "no-active-championship" ? (
              <CardEmptyState
                title="No active championship"
                description="There isn't a SCAR Championship in progress right now. Check back once the next one begins."
              />
            ) : groupResult.state === "tournament-complete" ? (
              <CardEmptyState
                title="Tournament complete"
                description={`All rounds of the ${groupResult.year} ${groupResult.championshipName} have been played. Check the leaderboard for final standings.`}
              />
            ) : groupResult.state === "not-enrolled" ? (
              <CardEmptyState
                title="You're not enrolled"
                description={`You're not registered as a participant in the ${groupResult.year} ${groupResult.championshipName}.`}
              />
            ) : (
              <CardEmptyState
                title="Pairings pending"
                description={`Pairings for Round ${groupResult.roundNumber} haven't been generated yet. Check back soon.`}
              />
            )}

            <QuickActions />

            <BrandQuoteCard />
          </div>

          <div className="flex flex-col gap-4 lg:w-[38%] lg:gap-5">
            <div className="flex gap-3">
              <StatCard
                label="Handicap"
                value={String(handicapResult.finalHandicap)}
                subtext="Current index"
                icon={Target}
              />
              <ChampionshipsPlayedCard years={championshipYears} />
            </div>

            <LeaderboardPreview players={topThree} />
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
