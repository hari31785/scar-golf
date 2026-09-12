"use client";

import { useState } from "react";
import { cn } from "cn";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { ScorecardsPageData } from "@/lib/tournament/scorecards";
import { formatTeeTime as formatTeeTimeShared } from "@/lib/format-date";

type FoundData = Extract<ScorecardsPageData, { state: "found" }>;

function formatTeeTime(iso: string | null): string {
  return formatTeeTimeShared(iso) ?? "Tee time TBD";
}

function groupStatusLabel(status: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED") {
  switch (status) {
    case "NOT_STARTED":
      return "Not started";
    case "IN_PROGRESS":
      return "In progress";
    case "SUBMITTED":
      return "Final";
  }
}

/**
 * Standard golf scorecard convention, relative to par: score is
 * wrapped in a shape as well as colored, so the meaning doesn't rely
 * on color alone (accessibility) — 1 circle = birdie, 2 (concentric)
 * circles = eagle-or-better, 1 square = bogey, 2 squares = double
 * bogey, 3 squares = triple-bogey-or-worse, plain = par.
 */
type ScoreMarkerSpec = {
  shape: "circle" | "square";
  rings: number;
  borderClass: string;
  textClass: string;
};

function scoreMarkerSpec(relativeToPar: number): ScoreMarkerSpec | null {
  if (relativeToPar <= -2) {
    return { shape: "circle", rings: 2, borderClass: "border-blue-700", textClass: "font-semibold text-blue-700" };
  }
  if (relativeToPar === -1) {
    return { shape: "circle", rings: 1, borderClass: "border-emerald-700", textClass: "font-semibold text-emerald-700" };
  }
  if (relativeToPar === 0) {
    return null;
  }
  if (relativeToPar === 1) {
    return { shape: "square", rings: 1, borderClass: "border-orange-500", textClass: "font-semibold text-orange-500" };
  }
  if (relativeToPar === 2) {
    return { shape: "square", rings: 2, borderClass: "border-red-700", textClass: "font-semibold text-red-700" };
  }
  return { shape: "square", rings: 3, borderClass: "border-red-800", textClass: "font-semibold text-red-800" };
}

/** Renders a score wrapped in the given number of concentric circle/square rings. */
function ScoreMarker({
  score,
  spec,
  size = "size-5",
}: {
  score: string | number;
  spec: ScoreMarkerSpec | null;
  size?: string;
}) {
  const step = spec?.shape === "circle" ? 2.5 : 2;
  return (
    <span className={cn("relative mx-auto flex items-center justify-center", size)}>
      {spec &&
        Array.from({ length: spec.rings }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              "pointer-events-none absolute border",
              spec.shape === "circle" ? "rounded-full" : "rounded-[2px]",
              spec.borderClass
            )}
            style={{ inset: `${-(step * (i + 1))}px` }}
          />
        ))}
      <span className={cn("relative z-10 tabular-nums", spec ? spec.textClass : "text-foreground")}>
        {score}
      </span>
    </span>
  );
}

export function ScorecardsClient({
  data,
  currentMemberId,
}: {
  data: FoundData;
  currentMemberId: string;
}) {
  const firstGeneratedRound =
    data.rounds.find((r) => r.groups.length > 0)?.roundNumber ?? data.rounds[0]?.roundNumber ?? 1;
  const [activeRound, setActiveRound] = useState(String(firstGeneratedRound));

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-emerald-900/10 bg-emerald-50 px-5 py-3 text-center">
        <p className="text-sm font-semibold text-emerald-950">
          {data.championshipName} {data.year}
        </p>
        <p className="text-xs font-medium text-emerald-800/80">Scorecards</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-b border-foreground/5 bg-card px-5 py-2 text-[0.65rem] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <ScoreMarker score={2} spec={scoreMarkerSpec(-2)} />
          Eagle+
        </span>
        <span className="flex items-center gap-1.5">
          <ScoreMarker score={3} spec={scoreMarkerSpec(-1)} />
          Birdie
        </span>
        <span className="flex items-center gap-1.5">
          <ScoreMarker score={4} spec={null} />
          Par
        </span>
        <span className="flex items-center gap-1.5">
          <ScoreMarker score={5} spec={scoreMarkerSpec(1)} />
          Bogey
        </span>
        <span className="flex items-center gap-1.5">
          <ScoreMarker score={6} spec={scoreMarkerSpec(2)} />
          Double
        </span>
        <span className="flex items-center gap-1.5">
          <ScoreMarker score={7} spec={scoreMarkerSpec(3)} />
          Triple+
        </span>
      </div>

      <Tabs value={activeRound} onValueChange={(v) => setActiveRound(String(v))} className="px-5 pt-4">
        <TabsList className="grid w-full grid-cols-4">
          {data.rounds.map((round) => (
            <TabsTrigger key={round.roundNumber} value={String(round.roundNumber)}>
              R{round.roundNumber}
            </TabsTrigger>
          ))}
        </TabsList>

        {data.rounds.map((round) => (
          <TabsContent key={round.roundNumber} value={String(round.roundNumber)}>
            <div className="flex flex-col gap-3 py-4">
              {round.groups.length === 0 ? (
                <div className="rounded-2xl bg-card p-4 text-center ring-1 ring-foreground/10">
                  <p className="text-sm text-muted-foreground">
                    {round.roundNumber === 1
                      ? "Scores will appear here once Round 1 begins."
                      : `Scores will appear here once Round ${round.roundNumber} begins.`}
                  </p>
                </div>
              ) : (
                round.groups.map((group) => {
                  const isOwnGroup = group.players.some((p) => p.memberId === currentMemberId);
                  const hasAnyScores = group.players.some((p) => p.thru > 0);
                  return (
                    <div
                      key={group.roundGroupId}
                      className={cn(
                        "rounded-2xl bg-card p-4 ring-1 ring-foreground/10",
                        isOwnGroup && "ring-2 ring-emerald-800/40"
                      )}
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            Group {group.groupNumber}
                            {isOwnGroup && (
                              <span className="ml-2 text-xs font-normal text-emerald-800">
                                Your group
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatTeeTime(group.teeTime)}</p>
                        </div>
                        <Badge
                          variant={group.status === "SUBMITTED" ? "default" : "secondary"}
                          className="shrink-0"
                        >
                          {groupStatusLabel(group.status)}
                        </Badge>
                      </div>

                      {!hasAnyScores ? (
                        <p className="text-xs text-muted-foreground">No scores recorded yet.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[560px] table-fixed border-collapse text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="w-28 py-1 text-left font-medium">Player</th>
                                {round.holes.map((h) => (
                                  <th key={h.holeNumber} className="w-6 py-1 text-center font-medium">
                                    {h.holeNumber}
                                  </th>
                                ))}
                                <th className="w-10 py-1 text-center font-semibold">Thru</th>
                                <th className="w-10 py-1 text-center font-semibold">Tot</th>
                              </tr>
                              <tr className="text-muted-foreground/70">
                                <th className="py-1 text-left font-normal">Par</th>
                                {round.holes.map((h) => (
                                  <th key={h.holeNumber} className="py-1 text-center font-normal">
                                    {h.par}
                                  </th>
                                ))}
                                <th className="py-1" />
                                <th className="py-1" />
                              </tr>
                            </thead>
                            <tbody>
                              {group.players.map((player) => {
                                const isMe = player.memberId === currentMemberId;
                                return (
                                  <tr
                                    key={player.championshipPlayerId}
                                    className={cn(
                                      "border-t border-foreground/5",
                                      isMe && "bg-emerald-50"
                                    )}
                                  >
                                    <td className="truncate py-1.5 pr-2 font-medium text-foreground">
                                      {player.displayName}
                                    </td>
                                    {round.holes.map((h) => {
                                      const score = player.scoresByHole[h.holeNumber];
                                      const relativeToPar =
                                        score !== undefined ? score - h.par : null;
                                      return (
                                        <td key={h.holeNumber} className="py-1.5 text-center">
                                          <ScoreMarker
                                            score={score ?? "–"}
                                            spec={relativeToPar !== null ? scoreMarkerSpec(relativeToPar) : null}
                                          />
                                        </td>
                                      );
                                    })}
                                    <td className="py-1.5 text-center font-medium text-foreground">
                                      {player.thru > 0 ? player.thru : "–"}
                                    </td>
                                    <td className="py-1.5 text-center font-semibold text-foreground">
                                      {player.thru > 0 ? player.runningTotal : "–"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
