"use client";

import { useState } from "react";
import { Award, MapPin, ChevronRight, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { StatCard } from "@/components/dashboard/stat-card";
import { formatCalendarDate } from "@/lib/format-date";
import type {
  MemberChampionshipYear,
  MemberYearRoundDetail,
  RoundHoleDetail,
} from "@/lib/tournament/history";
import { getRoundHoleDetailAction } from "@/app/actions/round-hole-detail";

/**
 * Wraps the "Championships" StatCard on the dashboard with a
 * click-to-drill-down flow:
 *   1. Card click opens a modal listing every year the member has
 *      actually played (COMPLETED championships + imported historical
 *      years only — matches the count shown on the card itself), each
 *      with its cumulative score for that year.
 *   2. Clicking a year opens a second modal with that year's individual
 *      round breakdown (course + score per round).
 *   3. Clicking a round (only when hole-level data exists — i.e. a real
 *      in-app round, never an imported historical row) opens a third
 *      modal with the 18-hole breakdown: Hole #, Par, Handicap (stroke
 *      index), and the score shot, highlighted in a distinct color.
 *      Historical/workbook rounds show a brief inline notice instead of
 *      opening a modal, since no hole-level data exists for them.
 */
export function ChampionshipsPlayedCard({
  years,
}: {
  years: MemberChampionshipYear[];
}) {
  const [yearsOpen, setYearsOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState<MemberChampionshipYear | null>(null);
  const [selectedRound, setSelectedRound] = useState<MemberYearRoundDetail | null>(null);
  const [holeState, setHoleState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "found"; holes: RoundHoleDetail[] }
    | null
  >(null);
  const [unavailableNotice, setUnavailableNotice] = useState(false);

  async function handleRoundClick(round: MemberYearRoundDetail) {
    if (!round.championshipRoundId || !round.championshipPlayerId) {
      // Historical/workbook rounds have no hole-level data — show a
      // brief inline notice instead of opening a modal.
      setUnavailableNotice(true);
      window.setTimeout(() => setUnavailableNotice(false), 2500);
      return;
    }

    setSelectedRound(round);
    setHoleState({ status: "loading" });
    const result = await getRoundHoleDetailAction({
      championshipRoundId: round.championshipRoundId,
      championshipPlayerId: round.championshipPlayerId,
    });
    if (result.ok) {
      setHoleState({ status: "found", holes: result.holes });
    } else {
      setHoleState({ status: "error", message: result.error });
    }
  }

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

          {unavailableNotice ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-800 ring-1 ring-amber-200">
              Detailed score is unavailable for this round.
            </p>
          ) : null}

          <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
            {selectedYear?.rounds.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No round data recorded for this year.
              </p>
            ) : (
              selectedYear?.rounds.map((r) => (
                <button
                  key={r.roundNumber}
                  type="button"
                  onClick={() => handleRoundClick(r)}
                  className="flex items-center justify-between gap-3 rounded-xl bg-card px-3.5 py-3 text-left ring-1 ring-foreground/10 transition active:scale-[0.99]"
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
                  <div className="flex shrink-0 items-center gap-1.5">
                    <p className="text-lg font-semibold text-foreground">{r.score}</p>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedRound !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRound(null);
            setHoleState(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Round {selectedRound?.roundNumber}</DialogTitle>
            <DialogDescription>
              {selectedRound?.courseName
                ? `${selectedRound.courseName}${selectedRound.courseCity ? ` (${selectedRound.courseCity})` : ""}`
                : "Hole-by-hole breakdown"}
            </DialogDescription>
          </DialogHeader>

          {holeState?.status === "loading" ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading scorecard…
            </div>
          ) : holeState?.status === "error" ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {holeState.message}
            </p>
          ) : holeState?.status === "found" ? (
            holeState.holes.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Detailed score is unavailable for this round.
              </p>
            ) : (
              <div className="flex max-h-[60vh] flex-col overflow-y-auto rounded-xl ring-1 ring-foreground/10">
                <div className="grid grid-cols-4 gap-2 bg-muted/60 px-3.5 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Hole</span>
                  <span>Par</span>
                  <span>Hcp</span>
                  <span className="text-right">Score</span>
                </div>
                {holeState.holes.map((h) => (
                  <div
                    key={h.holeNumber}
                    className="grid grid-cols-4 gap-2 border-t border-foreground/5 bg-card px-3.5 py-2.5 text-sm"
                  >
                    <span className="font-medium text-foreground">{h.holeNumber}</span>
                    <span className="text-muted-foreground">{h.par ?? "—"}</span>
                    <span className="text-muted-foreground">{h.strokeIndex ?? "—"}</span>
                    <span className="text-right text-base font-bold text-emerald-700">
                      {h.grossScore}
                    </span>
                  </div>
                ))}
              </div>
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
