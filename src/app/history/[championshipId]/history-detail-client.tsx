"use client";

import Link from "next/link";
import { ArrowLeft, Trophy } from "lucide-react";
import { cn } from "cn";
import type { HistoryChampionshipDetail } from "@/lib/tournament/history";

type FoundData = Extract<HistoryChampionshipDetail, { state: "found" }>;

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function HistoryDetailClient({ data }: { data: FoundData }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-emerald-900/10 bg-emerald-50 px-5 py-3">
        <Link
          href="/history"
          className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-800/80"
        >
          <ArrowLeft className="size-3.5" />
          Back to History
        </Link>
        <p className="text-sm font-semibold text-emerald-950">
          {data.name} {data.year}
        </p>
        {data.championDisplayName && (
          <div className="mt-2 flex items-center gap-1.5">
            <Trophy className="size-4 text-emerald-900" />
            <span className="text-sm font-semibold text-emerald-900">
              {data.championDisplayName}
            </span>
          </div>
        )}
      </div>

      {/* Final standings */}
      <div className="px-5 pt-5">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Final Standings
        </h2>
        <div className="flex flex-col gap-2">
          {data.standings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No standings recorded.
            </p>
          ) : (
            data.standings.map((row) => {
              const isChampion = row.finalPosition === 1;
              return (
                <div
                  key={row.championshipPlayerId}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ring-1",
                    isChampion
                      ? "bg-emerald-950 text-white ring-emerald-950"
                      : "bg-card ring-foreground/10"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        isChampion
                          ? "bg-white/15 text-white"
                          : "bg-emerald-50 text-emerald-900"
                      )}
                    >
                      {row.finalPosition ?? "—"}
                    </span>
                    <div className="flex flex-col">
                      <span
                        className={cn(
                          "text-sm font-medium",
                          isChampion ? "text-white" : "text-foreground"
                        )}
                      >
                        {row.displayName}
                      </span>
                      <span
                        className={cn(
                          "text-xs",
                          isChampion ? "text-white/70" : "text-muted-foreground"
                        )}
                      >
                        HCP {row.frozenHandicap ?? "—"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        isChampion ? "text-white" : "text-foreground"
                      )}
                    >
                      {row.cumulativeNet}
                    </span>
                    <span
                      className={cn(
                        "text-xs",
                        isChampion ? "text-white/70" : "text-muted-foreground"
                      )}
                    >
                      Gross {row.cumulativeGross}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Round / course history */}
      <div className="px-5 pb-5 pt-6">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Rounds
        </h2>
        <div className="flex flex-col gap-2">
          {data.rounds.map((round) => (
            <div
              key={round.roundNumber}
              className="flex flex-col gap-1 rounded-xl bg-card px-3 py-2.5 ring-1 ring-foreground/10"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  Round {round.roundNumber}
                </span>
                {round.playedDate && (
                  <span className="text-xs text-muted-foreground">
                    {formatDate(round.playedDate)}
                  </span>
                )}
              </div>
              <span className="text-sm text-foreground">
                {round.courseName ?? "—"}
                {round.courseCity ? ` · ${round.courseCity}` : ""}
              </span>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span>Tee: {round.teeName ?? "—"}{round.teeColor ? ` (${round.teeColor})` : ""}</span>
                <span>Rating: {round.courseRating ?? "—"}</span>
                <span>Slope: {round.slope ?? "—"}</span>
                <span>Par: {round.par ?? "—"}</span>
                <span>Yardage: {round.yardage ?? "—"}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
