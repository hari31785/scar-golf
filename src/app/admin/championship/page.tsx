import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/current-member";
import {
  getChampionshipForYear,
  listActiveMembersForChampionship,
  listParticipantStatuses,
} from "@/lib/admin/championship-data";
import { listRoundSetupSummaries } from "@/lib/admin/round-setup-data";
import { getAllRoundsPairingSummary } from "@/lib/tournament/pairing-summary";
import {
  championshipNeedsPlayoff,
  listTiedFirstPlacePlayers,
  getPlayoffSessionState,
} from "@/lib/tournament/playoff";
import { getMaxHandicap } from "@/lib/settings";
import { AdminChampionshipView } from "@/components/admin/admin-championship-view";

export const metadata: Metadata = {
  title: "Admin · Championship · SCAR Championship",
};

export default async function AdminChampionshipPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const current = await getCurrentMember();

  if (!current) {
    redirect("/sign-in");
  }

  // Server-side authorization boundary: PLAYER members are redirected
  // away even if they navigate here directly by URL — the real
  // enforcement lives here and in every admin server action.
  if (current.member.appRole !== "ADMIN") {
    redirect("/");
  }

  const { year: yearParam } = await searchParams;
  const year = yearParam ? Number(yearParam) : new Date().getFullYear();
  const selectedYear = Number.isInteger(year) ? year : new Date().getFullYear();

  const championship = await getChampionshipForYear(selectedYear);
  const members = championship
    ? await listActiveMembersForChampionship(championship.id)
    : [];
  const rounds = championship ? await listRoundSetupSummaries(championship.id) : [];
  const pairingRounds = championship ? await getAllRoundsPairingSummary(championship.id) : [];

  const needsPlayoff = championship ? await championshipNeedsPlayoff(championship.id) : false;
  const existingPlayoff = championship ? await getPlayoffSessionState(championship.id) : { state: "none" as const };
  const showPlayoffSection = needsPlayoff || existingPlayoff.state !== "none";
  const tiedPlayers =
    showPlayoffSection && championship ? await listTiedFirstPlacePlayers(championship.id) : [];

  const maxHandicap = await getMaxHandicap();

  const participantStatuses =
    championship && championship.status !== "DRAFT"
      ? await listParticipantStatuses(championship.id)
      : [];

  return (
    <AdminChampionshipView
      year={selectedYear}
      championship={championship}
      members={members}
      rounds={rounds}
      pairingRounds={pairingRounds}
      showPlayoffSection={showPlayoffSection}
      tiedPlayers={tiedPlayers}
      playoffSession={existingPlayoff}
      maxHandicap={maxHandicap}
      participantStatuses={participantStatuses}
    />
  );
}
