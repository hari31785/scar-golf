"use client";

import { useState } from "react";
import { cn } from "cn";
import type { ChampionshipRoundPairings } from "@/lib/tournament/pairing-summary";
import { PlayerCorrectionPanel } from "@/components/admin/player-correction-panel";

/**
 * Admin-only "Score Corrections" section for the /admin/championship
 * page. Lets an admin pick round → group → player, then hands off to
 * `PlayerCorrectionPanel` to load/edit that player's submitted
 * scorecard via the existing correction backend.
 *
 * Purely a selection shell — never reads/writes scores itself.
 */
export function ScoreCorrectionsSection({
  rounds,
}: {
  rounds: ChampionshipRoundPairings[];
}) {
  const roundsWithGroups = rounds.filter((r) => r.groups.length > 0);

  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(
    roundsWithGroups[0]?.championshipRoundId ?? null
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<{
    championshipPlayerId: string;
    displayName: string;
  } | null>(null);

  if (roundsWithGroups.length === 0) {
    return null;
  }

  const selectedRound =
    roundsWithGroups.find((r) => r.championshipRoundId === selectedRoundId) ??
    roundsWithGroups[0];
  const selectedGroup = selectedRound.groups.find(
    (g) => g.roundGroupId === selectedGroupId
  );

  function handleSelectRound(roundId: string) {
    setSelectedRoundId(roundId);
    setSelectedGroupId(null);
    setSelectedPlayer(null);
  }

  function handleSelectGroup(groupId: string) {
    setSelectedGroupId(groupId);
    setSelectedPlayer(null);
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Score Corrections
      </h2>

      <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        {/* Round selection */}
        <div className="flex flex-wrap gap-1.5">
          {roundsWithGroups.map((round) => (
            <button
              key={round.championshipRoundId}
              type="button"
              onClick={() => handleSelectRound(round.championshipRoundId)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold ring-1",
                round.championshipRoundId === selectedRound.championshipRoundId
                  ? "bg-emerald-950 text-white ring-emerald-950"
                  : "bg-muted/50 text-muted-foreground ring-foreground/10"
              )}
            >
              Round {round.roundNumber}
            </button>
          ))}
        </div>

        {/* Group selection */}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-foreground">Group</p>
          <div className="flex flex-wrap gap-1.5">
            {selectedRound.groups.map((group) => (
              <button
                key={group.roundGroupId}
                type="button"
                onClick={() => handleSelectGroup(group.roundGroupId)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold ring-1",
                  group.roundGroupId === selectedGroupId
                    ? "bg-emerald-950 text-white ring-emerald-950"
                    : "bg-muted/50 text-muted-foreground ring-foreground/10"
                )}
              >
                Group {group.groupNumber}
              </button>
            ))}
          </div>
        </div>

        {/* Player selection */}
        {selectedGroup && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-foreground">Player</p>
            <div className="flex flex-wrap gap-1.5">
              {selectedGroup.players
                .slice()
                .sort((a, b) => a.position - b.position)
                .map((player) => (
                  <button
                    key={player.championshipPlayerId}
                    type="button"
                    onClick={() =>
                      setSelectedPlayer({
                        championshipPlayerId: player.championshipPlayerId,
                        displayName: player.displayName,
                      })
                    }
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold ring-1",
                      player.championshipPlayerId ===
                        selectedPlayer?.championshipPlayerId
                        ? "bg-emerald-950 text-white ring-emerald-950"
                        : "bg-muted/50 text-muted-foreground ring-foreground/10"
                    )}
                  >
                    {player.displayName}
                  </button>
                ))}
            </div>
          </div>
        )}

        {selectedPlayer && (
          <PlayerCorrectionPanel
            key={`${selectedRound.championshipRoundId}:${selectedPlayer.championshipPlayerId}`}
            championshipRoundId={selectedRound.championshipRoundId}
            roundNumber={selectedRound.roundNumber}
            championshipPlayerId={selectedPlayer.championshipPlayerId}
            displayName={selectedPlayer.displayName}
          />
        )}
      </div>
    </section>
  );
}
