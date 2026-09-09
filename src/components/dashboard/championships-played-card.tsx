"use client";

import { useState } from "react";
import { Award, MapPin, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { StatCard } from "@/components/dashboard/stat-card";
import { formatCalendarDate } from "@/lib/format-date";
import type { MemberChampionshipYear } from "@/lib/tournament/history";

/**
 * Wraps the "Championships" StatCard on the dashboard with a
 * click-to-drill-down flow:
 *   1. Card click opens a modal listing every year the member has
 *      actually played (COMPLETED championships + imported historical
 *      years only — matches the count shown on the card itself), each
 *      with its cumulative score for that year.
 *   2. Clicking a year opens a second modal with that year's individual
 *      round breakdown (course + score per round).
 *
 * All data is fetched once, server-side, and passed in as `years` — no
 * extra round-trips are needed to open either modal.
 */
export function ChampionshipsPlayedCard({
  years,
}: {
  years: MemberChampionshipYear[];
}) {
  const [yearsOpen, setYearsOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState<MemberChampionshipYear | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setYearsOpen(true)}
        className="flex-1 text-left"
      >
        <StatCard
          label="Championships"
          value={String(years.length)}
          subtext="Played to date"
          icon={Award}
        />
      </button>

      <Dialog open={yearsOpen} onOpenChange={setYearsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Championships Played</DialogTitle>
            <DialogDescription>
              Every completed year, with your cumulative score.
            </DialogDescription>
          </DialogHeader>

          {years.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No completed championships yet.
            </p>
          ) : (
            <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
              {years.map((y) => (
                <button
                  key={`${y.year}-${y.championshipId ?? "historical"}`}
                  type="button"
                  onClick={() => setSelectedYear(y)}
                  className="flex items-center justify-between gap-3 rounded-xl bg-card px-3.5 py-3 text-left ring-1 ring-foreground/10 transition active:scale-[0.99]"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {y.year}
                      {y.championshipName ? ` · ${y.championshipName}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {y.roundsPlayed} {y.roundsPlayed === 1 ? "round" : "rounds"} ·{" "}
                      {y.scoreType === "net" ? "Net" : "Gross"} {y.cumulativeScore}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedYear !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedYear(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedYear?.year}
              {selectedYear?.championshipName ? ` · ${selectedYear.championshipName}` : ""}
            </DialogTitle>
            <DialogDescription>
              {selectedYear
                ? `${selectedYear.scoreType === "net" ? "Net" : "Gross"} cumulative score: ${selectedYear.cumulativeScore}`
                : null}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            {selectedYear?.rounds.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No round data recorded for this year.
              </p>
            ) : (
              selectedYear?.rounds.map((r) => (
                <div
                  key={r.roundNumber}
                  className="flex items-center justify-between gap-3 rounded-xl bg-card px-3.5 py-3 ring-1 ring-foreground/10"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Round {r.roundNumber}
                    </p>
                    {r.courseName ? (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3.5" />
                        <span>
                          {r.courseName}
                          {r.courseCity ? ` (${r.courseCity})` : ""}
                        </span>
                      </div>
                    ) : null}
                    {r.playedDate ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatCalendarDate(r.playedDate)}
                      </p>
                    ) : null}
                  </div>
                  <p className="text-lg font-semibold text-foreground">{r.score}</p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
