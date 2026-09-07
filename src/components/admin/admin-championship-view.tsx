"use client";

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { AdminChampionshipSummary, AdminChampionshipMemberRow } from "@/lib/admin/championship-data";
import type { RoundSetupSummary } from "@/lib/admin/round-setup-data";
import type { ChampionshipRoundPairings } from "@/lib/tournament/pairing-summary";
import { CreateChampionshipForm } from "@/components/admin/create-championship-form";
import { ChampionshipSummaryCard } from "@/components/admin/championship-summary-card";
import { ChampionshipParticipantRow } from "@/components/admin/championship-participant-row";
import { RoundSetupSection } from "@/components/admin/round-setup-section";
import { StartChampionshipSection } from "@/components/admin/start-championship-section";
import { PairingsSection } from "@/components/admin/pairings-section";
import { ScoreCorrectionsSection } from "@/components/admin/score-corrections-section";
import { PlayoffSection } from "@/components/admin/playoff-section";
import { AdminSettingsSection } from "@/components/admin/admin-settings-section";
import type { TiedPlayerRow, PlayoffSessionState } from "@/lib/tournament/playoff";

export function AdminChampionshipView({
  year,
  championship,
  members,
  rounds,
  pairingRounds,
  showPlayoffSection = false,
  tiedPlayers = [],
  playoffSession = { state: "none" },
  maxHandicap,
}: {
  year: number;
  championship: AdminChampionshipSummary | null;
  members: AdminChampionshipMemberRow[];
  rounds: RoundSetupSummary[];
  pairingRounds: ChampionshipRoundPairings[];
  showPlayoffSection?: boolean;
  tiedPlayers?: TiedPlayerRow[];
  playoffSession?: PlayoffSessionState;
  maxHandicap: number;
}) {
  const isDraft = championship?.status === "DRAFT";

  const permanentMembers = members.filter((m) => m.membershipType === "PERMANENT");
  const associateMembers = members.filter((m) => m.membershipType === "ASSOCIATE");

  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/30">
      <header className="sticky top-0 z-20 border-b border-emerald-900/10 bg-emerald-950 px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-4 text-white">
        <Link
          href="/"
          className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-300 hover:text-emerald-200"
        >
          <ArrowLeft className="size-3.5" />
          Dashboard
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-900 text-emerald-300">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <p className="text-[0.65rem] font-semibold tracking-[0.2em] text-emerald-300 uppercase">
              Admin
            </p>
            <h1 className="text-xl font-semibold tracking-tight">Championship</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pb-16 pt-5">
        <AdminSettingsSection initialMaxHandicap={maxHandicap} />

        {!championship ? (
          <CreateChampionshipForm year={year} />
        ) : (
          <>
            <ChampionshipSummaryCard championship={championship} />

            {rounds.length > 0 && <RoundSetupSection rounds={rounds} isDraft={isDraft} />}

            {isDraft && <StartChampionshipSection championship={championship} rounds={rounds} />}

            <PairingsSection rounds={pairingRounds} />

            {showPlayoffSection && (
              <PlayoffSection
                championshipId={championship.id}
                tiedPlayers={tiedPlayers}
                initialSession={playoffSession}
              />
            )}

            {(championship.status === "ACTIVE" || championship.status === "COMPLETED") && (
              <ScoreCorrectionsSection rounds={pairingRounds} />
            )}

            {!isDraft && (
              <div className="rounded-2xl bg-card p-4 text-center ring-1 ring-foreground/10">
                <p className="text-sm text-muted-foreground">
                  This championship is {championship.status.toLowerCase()} — participants can
                  only be added or removed while it is DRAFT.
                </p>
              </div>
            )}

            {members.length === 0 ? (
              <div className="rounded-2xl bg-card p-4 text-center ring-1 ring-foreground/10">
                <p className="text-sm text-muted-foreground">No active SCAR members found.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {permanentMembers.length > 0 && (
                  <section className="flex flex-col gap-2">
                    <h2 className="px-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Permanent
                    </h2>
                    <div className="flex flex-col gap-2">
                      {permanentMembers.map((member) => (
                        <ChampionshipParticipantRow
                          key={member.memberId}
                          member={member}
                          championshipId={championship.id}
                          canMutate={isDraft}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {associateMembers.length > 0 && (
                  <section className="flex flex-col gap-2">
                    <h2 className="px-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Associate
                    </h2>
                    <div className="flex flex-col gap-2">
                      {associateMembers.map((member) => (
                        <ChampionshipParticipantRow
                          key={member.memberId}
                          member={member}
                          championshipId={championship.id}
                          canMutate={isDraft}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
