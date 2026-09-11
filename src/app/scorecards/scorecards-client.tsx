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
 * on color alone (accessibility) — circle = birdie, double circle =
 * eagle-or-better, square = bogey, double square = double-bogey-or-
 * worse, plain = par.
 */
function scoreDisplayClass(relativeToPar: number): string {
  if (relativeToPar <= -2) {
    return "font-semibold text-blue-700 rounded-full ring-2 ring-inset ring-blue-700";
  }
  if (relativeToPar === -1) {
    return "font-semibold text-emerald-700 rounded-full ring-1 ring-inset ring-emerald-700";
  }
  if (relativeToPar === 0) {
    return "text-foreground";
  }
  if (relativeToPar === 1) {
    return "font-semibold text-orange-500 rounded-[3px] ring-1 ring-inset ring-orange-500";
  }
  return "font-semibold text-red-800 rounded-[3px] ring-2 ring-inset ring-red-800";
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

      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-foreground/5 bg-card px-5 py-2 text-[0.65rem] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="flex size-4 items-center justify-center rounded-full font-semibold text-blue-700 ring-2 ring-inset ring-blue-700">
            2
          </span>
          Eagle+
        </span>
        <span className="flex items-center gap-1">
          <span className="flex size-4 items-center justify-center rounded-full font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-700">
            3
          </span>
          Birdie
        </span>
        <span className="flex items-center gap-1">
          <span className="flex size-4 items-center justify-center text-foreground">4</span>
          Par
        </span>
        <span className="flex items-center gap-1">
          <span className="flex size-4 items-center justify-center rounded-[3px] font-semibold text-orange-500 ring-1 ring-inset ring-orange-500">
            5
          </span>
          Bogey
        </span>
        <span className="flex items-center gap-1">
          <span className="flex size-4 items-center justify-center rounded-[3px] font-semibold text-red-800 ring-2 ring-inset ring-red-800">
            6
          </span>
          Double+
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
                                          <span
                                            className={cn(
                                              "mx-auto flex size-5 items-center justify-center tabular-nums",
                                              relativeToPar !== null
                                                ? scoreDisplayClass(relativeToPar)
                                                : "text-foreground"
                                            )}
                                          >
                                            {score ?? "–"}
                                          </span>
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
