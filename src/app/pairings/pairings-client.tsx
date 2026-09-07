"use client";

import { useState } from "react";
import { cn } from "cn";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { PairingsPageData } from "@/lib/tournament/pairing-summary";

type FoundData = Extract<PairingsPageData, { state: "found" }>;

function formatTeeTime(iso: string | null): string {
  if (!iso) return "Tee time TBD";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function membershipLabel(type: "PERMANENT" | "ASSOCIATE" | null) {
  if (type === "PERMANENT") return "Permanent";
  if (type === "ASSOCIATE") return "Associate";
  return null;
}

export function PairingsClient({
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
        <p className="text-xs font-medium text-emerald-800/80">Pairings</p>
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
            <div className="flex flex-col gap-2 py-4">
              {round.groups.length === 0 ? (
                <div className="rounded-2xl bg-card p-4 text-center ring-1 ring-foreground/10">
                  <p className="text-sm text-muted-foreground">
                    {round.roundNumber === 1
                      ? "Pairings will be available after the championship starts."
                      : `Pairings will be available after Round ${round.roundNumber - 1} is complete.`}
                  </p>
                </div>
              ) : (
                round.groups.map((group) => {
                  const isOwnGroup = group.players.some((p) => p.memberId === currentMemberId);
                  return (
                    <div
                      key={group.roundGroupId}
                      className={cn(
                        "rounded-2xl bg-card p-4 ring-1 ring-foreground/10",
                        isOwnGroup && "bg-emerald-950 text-white ring-emerald-950"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">
                          Group {group.groupNumber}
                          {isOwnGroup && (
                            <span className="ml-2 text-xs font-normal text-emerald-200">
                              Your group
                            </span>
                          )}
                        </p>
                        <span
                          className={cn(
                            "text-xs font-medium",
                            isOwnGroup ? "text-emerald-200" : "text-muted-foreground"
                          )}
                        >
                          {formatTeeTime(group.teeTime)}
                        </span>
                      </div>
                      <ul className="mt-2 flex flex-col gap-1">
                        {group.players
                          .slice()
                          .sort((a, b) => a.position - b.position)
                          .map((player) => (
                            <li
                              key={player.championshipPlayerId}
                              className="flex items-center justify-between text-sm"
                            >
                              <span>
                                {player.position}. {player.displayName}
                                {player.memberId === currentMemberId && (
                                  <span
                                    className={cn(
                                      "ml-2 text-xs font-normal",
                                      isOwnGroup ? "text-emerald-200" : "text-emerald-700"
                                    )}
                                  >
                                    You
                                  </span>
                                )}
                              </span>
                              <span
                                className={cn(
                                  "flex items-center gap-2 text-xs",
                                  isOwnGroup ? "text-emerald-200" : "text-muted-foreground"
                                )}
                              >
                                HCP {player.frozenHandicap ?? "—"}
                                {membershipLabel(player.membershipType) && (
                                  <Badge
                                    variant="outline"
                                    className={cn(isOwnGroup && "border-emerald-300 text-emerald-100")}
                                  >
                                    {membershipLabel(player.membershipType)}
                                  </Badge>
                                )}
                              </span>
                            </li>
                          ))}
                      </ul>
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
