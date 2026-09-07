import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/current-member";
import { getInitials } from "@/lib/members";
import { getCurrentGroupForMember } from "@/lib/tournament/current-group";
import { AppHeader } from "@/components/dashboard/app-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flag, Clock, Users, ChevronRight, CircleUserRound } from "lucide-react";

function formatTeeTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function groupStatusLabel(status: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED") {
  switch (status) {
    case "NOT_STARTED":
      return "Not started";
    case "IN_PROGRESS":
      return "In progress";
    case "SUBMITTED":
      return "Submitted";
  }
}

export default async function ScorePage() {
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

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 pb-28 pt-5">
        {result.state === "no-active-championship" && (
          <EmptyState
            title="No championship in progress"
            description="There isn't an active SCAR Championship right now. Check back once the next one begins."
          />
        )}

        {result.state === "tournament-complete" && (
          <EmptyState
            title="Tournament complete"
            description={`All rounds of the ${result.year} ${result.championshipName} have been played. Check the leaderboard for final standings.`}
          />
        )}

        {result.state === "not-enrolled" && (
          <EmptyState
            title="You're not enrolled"
            description={`You're not registered as a participant in the ${result.year} ${result.championshipName}. Contact an admin if you believe this is a mistake.`}
          />
        )}

        {result.state === "no-group" && (
          <EmptyState
            title="No group assigned yet"
            description={`Pairings for Round ${result.roundNumber} haven't placed you in a group yet. Check back soon.`}
          />
        )}

        {result.state === "found" && (
          <>
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-900 via-emerald-950 to-black p-5 text-white shadow-lg shadow-emerald-950/20">
              <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-emerald-400/10 blur-2xl" />
              <div className="relative">
                <p className="text-[0.65rem] font-semibold tracking-[0.2em] text-emerald-300 uppercase">
                  {result.year} {result.championshipName}
                </p>
                <h2 className="mt-1 text-lg font-semibold leading-snug">
                  {result.courseName ?? "Course TBD"}
                  {result.teeName ? ` · ${result.teeName} Tees` : ""}
                </h2>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-white/5 p-3">
                    <div className="flex items-center gap-1.5 text-emerald-300">
                      <Flag className="size-3.5" />
                      <span className="text-[0.65rem] font-medium uppercase tracking-wide">
                        Round
                      </span>
                    </div>
                    <p className="mt-1 text-base font-semibold">
                      {result.roundNumber}
                      <span className="text-xs font-normal text-white/60">
                        /{result.totalRounds}
                      </span>
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/5 p-3">
                    <div className="flex items-center gap-1.5 text-emerald-300">
                      <Clock className="size-3.5" />
                      <span className="text-[0.65rem] font-medium uppercase tracking-wide">
                        Tee Time
                      </span>
                    </div>
                    <p className="mt-1 text-base font-semibold">
                      {formatTeeTime(result.teeTime) ?? "TBD"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/5 p-3">
                    <div className="flex items-center gap-1.5 text-emerald-300">
                      <Users className="size-3.5" />
                      <span className="text-[0.65rem] font-medium uppercase tracking-wide">
                        Group
                      </span>
                    </div>
                    <p className="mt-1 text-base font-semibold">
                      #{result.groupNumber}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <Badge
                    variant="secondary"
                    className="bg-white/10 text-emerald-100"
                  >
                    {groupStatusLabel(result.groupStatus)}
                  </Badge>
                </div>

                <Button
                  render={<a href="/score/enter" />}
                  className="mt-4 h-12 w-full justify-between rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-emerald-950 hover:bg-emerald-300"
                >
                  Enter Scores
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>

            <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
              <h3 className="text-sm font-semibold text-foreground">
                Your Group
              </h3>
              <ul className="mt-3 flex flex-col divide-y divide-foreground/10">
                {result.players.map((player) => (
                  <li
                    key={player.championshipPlayerId}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-full bg-emerald-900/10 text-emerald-900">
                        <CircleUserRound className="size-5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {player.displayName}
                          {player.isSelf ? (
                            <span className="ml-2 text-xs font-normal text-emerald-700">
                              You
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                        Handicap
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {player.frozenHandicap ?? "—"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-card px-6 py-16 text-center ring-1 ring-foreground/10">
      <Flag className="mb-2 size-8 text-emerald-800/60" />
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="max-w-xs text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
