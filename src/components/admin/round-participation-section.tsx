"use client";

import { useState, useTransition } from "react";
import { UserX, UserCheck } from "lucide-react";
import { cn } from "cn";
import type { ChampionshipRoundPairings } from "@/lib/tournament/pairing-summary";
import { setPlayerRoundSkipAction } from "@/lib/admin/championship-actions";

/**
 * Admin-only per-ROUND participation control: lets an admin mark a
 * player as skipping ONE specific round (e.g. played Round 1, sat out
 * Round 2, returns for Round 3) without touching their overall
 * championship-wide ACTIVE/WITHDRAWN/DISQUALIFIED status (that's the
 * separate "Participant Status" section).
 *
 * Unlike the scoring-screen version of this control, an ADMIN may DQ a
 * player for a round even after their group has already submitted —
 * doing so deletes their scorecard submission for this round (and the
 * played-round record that feeds handicaps), so their score stops
 * counting toward the leaderboard/standings retroactively.
 */
export function RoundParticipationSection({ round }: { round: ChampionshipRoundPairings }) {
  const submittedGroupIds = new Set(
    round.groups.filter((g) => g.status === "SUBMITTED").map((g) => g.roundGroupId)
  );

  const players = round.groups
    .flatMap((g) =>
      g.players.map((p) => ({ ...p, groupSubmitted: submittedGroupIds.has(g.roundGroupId) }))
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const [skippedIds, setSkippedIds] = useState<Set<string>>(
    () => new Set(players.filter((p) => p.skippedRound).map((p) => p.championshipPlayerId))
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (players.length === 0) return null;

  function toggle(championshipPlayerId: string, nextSkipped: boolean, groupSubmitted: boolean) {
    if (nextSkipped && groupSubmitted) {
      const confirmed = window.confirm(
        "This player already submitted a scorecard for this round. Disqualifying them now will permanently delete their submitted score for this round and remove it from the leaderboard/handicap history. Continue?"
      );
      if (!confirmed) return;
    }
    setError(null);
    setPendingId(championshipPlayerId);
    startTransition(async () => {
      const result = await setPlayerRoundSkipAction({
        championshipRoundId: round.championshipRoundId,
        championshipPlayerId,
        skipped: nextSkipped,
      });
      setPendingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSkippedIds((prev) => {
        const next = new Set(prev);
        if (nextSkipped) next.add(championshipPlayerId);
        else next.delete(championshipPlayerId);
        return next;
      });
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Round Participation</h3>
        <p className="text-xs text-muted-foreground">
          Disqualify a player for Round {round.roundNumber} only — they can return for a
          later round. This does not withdraw or disqualify them from the whole
          championship. If their scorecard was already submitted, disqualifying them
          deletes that score so it no longer counts.
        </p>
      </div>

      {error && <p className="text-xs font-medium text-destructive">{error}</p>}

      <div className="flex flex-col gap-2">
        {players.map((player) => {
          const isSkipped = skippedIds.has(player.championshipPlayerId);
          return (
            <div
              key={player.championshipPlayerId}
              className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{player.displayName}</p>
                {player.groupSubmitted && !isSkipped && (
                  <p className="text-[0.65rem] text-muted-foreground">Scorecard submitted</p>
                )}
              </div>
              <button
                type="button"
                disabled={pendingId === player.championshipPlayerId}
                onClick={() => toggle(player.championshipPlayerId, !isSkipped, player.groupSubmitted)}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[0.7rem] font-semibold disabled:opacity-50",
                  isSkipped
                    ? "bg-emerald-900/10 text-emerald-800"
                    : "bg-destructive/10 text-destructive"
                )}
              >
                {isSkipped ? (
                  <>
                    <UserCheck className="size-3" /> Include
                  </>
                ) : (
                  <>
                    <UserX className="size-3" /> DQ round
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
