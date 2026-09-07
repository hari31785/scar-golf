"use client";

import { useState, useTransition } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { TiedPlayerRow, PlayoffSessionState } from "@/lib/tournament/playoff";
import {
  createPlayoffSessionAction,
  recordPlayoffHoleAction,
} from "@/lib/admin/playoff-actions";

/**
 * ADMIN-only "Playoff" section for /admin/championship — only rendered
 * by the server page when the championship needs (or already has) a
 * sudden-death playoff. Selection of tied players, hole-by-hole score
 * entry, and playoff history are all driven through the existing
 * playoff service via server actions; this component never writes to
 * the database directly.
 */
export function PlayoffSection({
  championshipId,
  tiedPlayers,
  initialSession,
}: {
  championshipId: string;
  tiedPlayers: TiedPlayerRow[];
  initialSession: PlayoffSessionState;
}) {
  const [session, setSession] = useState<PlayoffSessionState>(initialSession);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handleCreateSession() {
    setError(null);
    startTransition(async () => {
      const result = await createPlayoffSessionAction({
        championshipId,
        championshipPlayerIds: selectedIds,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSession(result.session);
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Playoff
      </h2>

      <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        {session.state === "none" ? (
          <>
            <p className="text-sm text-foreground">
              First place is tied. Select the players participating in the
              sudden-death playoff.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tiedPlayers.map((player) => (
                <button
                  key={player.championshipPlayerId}
                  type="button"
                  onClick={() => toggleSelected(player.championshipPlayerId)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold ring-1",
                    selectedIds.includes(player.championshipPlayerId)
                      ? "bg-emerald-950 text-white ring-emerald-950"
                      : "bg-muted/50 text-muted-foreground ring-foreground/10"
                  )}
                >
                  {player.displayName}
                </button>
              ))}
            </div>
            {error && <p className="text-xs font-medium text-destructive">{error}</p>}
            <Button
              type="button"
              disabled={isPending || selectedIds.length < 2}
              onClick={handleCreateSession}
              className="h-11 rounded-xl text-sm font-semibold"
            >
              {isPending ? "Starting…" : "Start Playoff"}
            </Button>
          </>
        ) : (
          <PlayoffLive
            championshipId={championshipId}
            session={session}
            onSessionChange={setSession}
          />
        )}
      </div>
    </section>
  );
}

function PlayoffLive({
  championshipId,
  session,
  onSessionChange,
}: {
  championshipId: string;
  session: Extract<PlayoffSessionState, { state: "in-progress" | "resolved" }>;
  onSessionChange: (session: PlayoffSessionState) => void;
}) {
  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const nextSequenceNumber =
    session.holes.length === 0
      ? 1
      : Math.max(...session.holes.map((h) => h.sequenceNumber)) + 1;

  const displayNameById = new Map(
    session.participants.map((p) => [p.championshipPlayerId, p.displayName])
  );
  const winner =
    session.winnerChampionshipPlayerId !== null
      ? session.participants.find(
          (p) => p.championshipPlayerId === session.winnerChampionshipPlayerId
        )
      : null;

  function handleSubmitHole() {
    setError(null);
    const scores = session.participants.map((p) => {
      const raw = scoreInputs[p.championshipPlayerId] ?? "";
      return { championshipPlayerId: p.championshipPlayerId, grossScore: Number(raw) };
    });
    if (scores.some((s) => !Number.isInteger(s.grossScore) || s.grossScore <= 0)) {
      setError("Enter a valid positive score for every player.");
      return;
    }
    startTransition(async () => {
      const result = await recordPlayoffHoleAction({
        championshipId,
        playoffSessionId: session.playoffSessionId,
        scores,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSessionChange(result.session);
      setScoreInputs({});
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {session.state === "resolved" && winner ? (
        <div className="rounded-xl bg-emerald-950 px-4 py-3 text-center text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Playoff Champion
          </p>
          <p className="text-lg font-bold">{winner.displayName}</p>
          <p className="text-xs text-emerald-200">Championship is now COMPLETED.</p>
        </div>
      ) : (
        <>
          <p className="text-sm font-semibold text-foreground">
            Playoff Hole {nextSequenceNumber}
          </p>
          <div className="flex flex-col gap-2">
            {session.participants.map((player) => (
              <label
                key={player.championshipPlayerId}
                className="flex items-center justify-between gap-3 text-sm font-medium text-foreground"
              >
                {player.displayName}
                <Input
                  type="number"
                  min={1}
                  max={20}
                  className="w-20"
                  value={scoreInputs[player.championshipPlayerId] ?? ""}
                  onChange={(e) =>
                    setScoreInputs((prev) => ({
                      ...prev,
                      [player.championshipPlayerId]: e.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>
          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
          <Button
            type="button"
            disabled={isPending}
            onClick={handleSubmitHole}
            className="h-11 rounded-xl text-sm font-semibold"
          >
            {isPending ? "Saving…" : "Submit Hole Result"}
          </Button>
        </>
      )}

      {session.holes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-foreground">Playoff History</p>
          {session.holes
            .slice()
            .sort((a, b) => b.sequenceNumber - a.sequenceNumber)
            .map((hole) => {
              const lowest = Math.min(...hole.scores.map((s) => s.grossScore));
              const lowestCount = hole.scores.filter((s) => s.grossScore === lowest).length;
              return (
                <div
                  key={hole.playoffHoleId}
                  className="flex flex-col gap-1 rounded-lg bg-muted/40 px-2.5 py-2 text-xs ring-1 ring-foreground/10"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">
                      Hole {hole.sequenceNumber}
                    </span>
                    {lowestCount === 1 ? (
                      <Badge variant="default">Winner recorded</Badge>
                    ) : (
                      <Badge variant="secondary">Tied — continued</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                    {hole.scores.map((s) => (
                      <span key={s.championshipPlayerId}>
                        {displayNameById.get(s.championshipPlayerId) ?? "—"}: {s.grossScore}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
