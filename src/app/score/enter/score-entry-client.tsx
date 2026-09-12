"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Lock, Minus, Plus, TriangleAlert, UserX, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "cn";
import type { CurrentGroupResult, HoleScoresByHole } from "@/lib/tournament/current-group";
import { evaluateScorecardCompleteness } from "@/lib/tournament/scoring/completeness";
import { saveHoleScoresForGroupAction, submitRoundGroupAction, setPlayerRoundSkipAction } from "./actions";

type FoundResult = Extract<CurrentGroupResult, { state: "found" }>;

const TOTAL_HOLES = 18;
const MIN_SCORE = 1;
const MAX_SCORE = 20;

type HoleSaveStatus = "unsaved" | "saving" | "saved" | "error";

export function ScoreEntryClient({
  initialData,
  currentMemberId,
}: {
  initialData: FoundResult;
  currentMemberId: string;
}) {
  const isReadOnly = initialData.groupStatus === "SUBMITTED";
  const router = useRouter();

  const [skippedRoundIds, setSkippedRoundIds] = useState<Set<string>>(
    () => new Set(initialData.players.filter((p) => p.skippedRound).map((p) => p.championshipPlayerId))
  );
  const [skipPendingId, setSkipPendingId] = useState<string | null>(null);
  const [skipError, setSkipError] = useState<string | null>(null);

  function toggleRoundSkip(championshipPlayerId: string, nextSkipped: boolean) {
    setSkipError(null);
    setSkipPendingId(championshipPlayerId);
    startTransition(async () => {
      const result = await setPlayerRoundSkipAction({
        championshipRoundId: initialData.championshipRoundId,
        championshipPlayerId,
        skipped: nextSkipped,
      });
      setSkipPendingId(null);
      if (!result.ok) {
        setSkipError(result.error);
        return;
      }
      setSkippedRoundIds((prev) => {
        const next = new Set(prev);
        if (nextSkipped) next.add(championshipPlayerId);
        else next.delete(championshipPlayerId);
        return next;
      });
      router.refresh();
    });
  }

  const editablePlayerIds = useMemo(
    () =>
      new Set(
        initialData.players
          .filter(
            (p) => p.participantStatus === "ACTIVE" && !skippedRoundIds.has(p.championshipPlayerId)
          )
          .map((p) => p.championshipPlayerId)
      ),
    [initialData.players, skippedRoundIds]
  );

  const parByHole = useMemo(
    () => new Map(initialData.holes.map((h) => [h.holeNumber, h.par])),
    [initialData.holes]
  );

  // Pre-fill every editable player's score with that hole's par, for
  // any hole/player combination that has no persisted value yet — this
  // is what makes most holes a 0-2 tap adjustment instead of stepping
  // all the way up from empty. Historical/persisted values from the
  // server always win over the par default.
  const initialScores = useMemo(() => {
    const next: HoleScoresByHole = {};
    for (const hole of initialData.holes) {
      next[hole.holeNumber] = { ...(initialData.scores[hole.holeNumber] ?? {}) };
      for (const playerId of editablePlayerIds) {
        if (next[hole.holeNumber][playerId] === undefined) {
          next[hole.holeNumber][playerId] = hole.par;
        }
      }
    }
    return next;
  }, [initialData.holes, initialData.scores, editablePlayerIds]);

  const [currentHole, setCurrentHole] = useState(1);
  const [scores, setScores] = useState<HoleScoresByHole>(initialScores);
  const [isPending, startTransition] = useTransition();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Per-hole save state, for the single status indicator + retry
  // affordance. A hole starts "saved" if the server already had a
  // persisted value for every editable player on it (nothing to do),
  // otherwise "unsaved" until the golfer leaves it for the first time.
  const initialHoleStatus = useMemo(() => {
    const status: Record<number, HoleSaveStatus> = {};
    for (const hole of initialData.holes) {
      const persisted = initialData.scores[hole.holeNumber] ?? {};
      const allPersisted = Array.from(editablePlayerIds).every(
        (id) => persisted[id] !== undefined
      );
      status[hole.holeNumber] = allPersisted ? "saved" : "unsaved";
    }
    return status;
  }, [initialData.holes, initialData.scores, editablePlayerIds]);
  const [holeStatus, setHoleStatus] = useState<Record<number, HoleSaveStatus>>(initialHoleStatus);

  // Tracks which holes have local edits not yet reflected in the last
  // successful save for that hole — this is what decides whether
  // leaving a hole needs to trigger a new batch save at all.
  const dirtyHolesRef = useRef<Set<number>>(new Set());

  function getValue(holeNumber: number, championshipPlayerId: string): number | null {
    return scores[holeNumber]?.[championshipPlayerId] ?? null;
  }

  function setValueLocally(holeNumber: number, championshipPlayerId: string, value: number) {
    setScores((prev) => ({
      ...prev,
      [holeNumber]: { ...prev[holeNumber], [championshipPlayerId]: value },
    }));
    dirtyHolesRef.current.add(holeNumber);
    setHoleStatus((prev) => ({ ...prev, [holeNumber]: "unsaved" }));
  }

  function adjust(championshipPlayerId: string, delta: number) {
    if (isReadOnly || !editablePlayerIds.has(championshipPlayerId)) return;
    const current =
      getValue(currentHole, championshipPlayerId) ?? parByHole.get(currentHole) ?? MIN_SCORE;
    const next = Math.min(MAX_SCORE, Math.max(MIN_SCORE, current + delta));
    if (next === current) return;
    setValueLocally(currentHole, championshipPlayerId, next);
  }

  // Batch-saves every editable player's current value for one hole in
  // a single call, only if that hole actually has unsaved local edits.
  // Used both when navigating away from a hole and as the submit-time
  // safety net for whatever hole is currently active.
  const saveHole = useCallback(
    (holeNumber: number): Promise<boolean> => {
      if (isReadOnly) return Promise.resolve(true);
      if (!dirtyHolesRef.current.has(holeNumber)) return Promise.resolve(true);

      const holeScores = scores[holeNumber] ?? {};
      const entries = Array.from(editablePlayerIds)
        .map((championshipPlayerId) => {
          const grossScore = holeScores[championshipPlayerId];
          return grossScore === undefined ? null : { championshipPlayerId, grossScore };
        })
        .filter((e): e is { championshipPlayerId: string; grossScore: number } => e !== null);

      if (entries.length === 0) return Promise.resolve(true);

      setHoleStatus((prev) => ({ ...prev, [holeNumber]: "saving" }));

      return new Promise((resolve) => {
        startTransition(async () => {
          const result = await saveHoleScoresForGroupAction({
            championshipRoundId: initialData.championshipRoundId,
            holeNumber,
            scores: entries,
          });
          if (result.ok) {
            dirtyHolesRef.current.delete(holeNumber);
            setHoleStatus((prev) => ({ ...prev, [holeNumber]: "saved" }));
            resolve(true);
          } else {
            setHoleStatus((prev) => ({ ...prev, [holeNumber]: "error" }));
            resolve(false);
          }
        });
      });
    },
    [isReadOnly, scores, editablePlayerIds, initialData.championshipRoundId]
  );

  function goToHole(nextHole: number) {
    if (nextHole === currentHole) return;
    const holeToSave = currentHole;
    setCurrentHole(nextHole);
    void saveHole(holeToSave);
  }

  const currentHoleInfo = initialData.holes.find((h) => h.holeNumber === currentHole) ?? null;

  // "Blue Tees · 6,742 yds · 71.8 / 132" — built from whatever metadata
  // actually exists; missing pieces (e.g. blank teeColor) are omitted
  // gracefully rather than leaving a stray separator.
  const courseSummaryParts: string[] = [];
  if (initialData.teeColor) courseSummaryParts.push(`${initialData.teeColor} Tees`);
  else if (initialData.teeName) courseSummaryParts.push(`${initialData.teeName} Tees`);
  if (initialData.yardage) courseSummaryParts.push(`${initialData.yardage.toLocaleString()} yds`);
  if (initialData.courseRating !== null && initialData.slope !== null) {
    courseSummaryParts.push(`${initialData.courseRating.toFixed(1)} / ${initialData.slope}`);
  }
  const courseSummary = courseSummaryParts.join(" · ");

  // Per-ACTIVE-player completeness, reusing the same pure rule the
  // backend uses (exactly holes 1-18, each with a valid gross score).
  // WITHDRAWN/DISQUALIFIED players, and anyone skipping THIS round,
  // never block submission.
  const activePlayers = initialData.players.filter(
    (p) => p.participantStatus === "ACTIVE" && !skippedRoundIds.has(p.championshipPlayerId)
  );
  const playerCompleteness = useMemo(() => {
    return activePlayers.map((player) => {
      const entries = Object.entries(scores).flatMap(([holeNumber, byPlayer]) => {
        const grossScore = byPlayer[player.championshipPlayerId];
        return grossScore === undefined
          ? []
          : [{ holeNumber: Number(holeNumber), grossScore }];
      });
      return {
        player,
        result: evaluateScorecardCompleteness(entries),
      };
    });
  }, [activePlayers, scores]);

  const totalMissingScores = playerCompleteness.reduce(
    (sum, { result }) => sum + result.missingHoles.length,
    0
  );
  const allComplete = totalMissingScores === 0;
  const canSubmit = !isReadOnly && allComplete;
  const anyHoleSaving = Object.values(holeStatus).some((s) => s === "saving");
  const anyHoleError = Object.values(holeStatus).some((s) => s === "error");

  // Running gross total + relative-to-par through the holes actually
  // reached so far (holes 1..currentHole only — NOT every hole with a
  // value in state, since the par pre-fill means holes not yet visited
  // already carry a default value that shouldn't count toward "thru N").
  const runningTotals = useMemo(() => {
    const totals: Record<string, { gross: number; toPar: number }> = {};
    for (const player of initialData.players) {
      let gross = 0;
      let par = 0;
      for (let hole = 1; hole <= currentHole; hole++) {
        const holePar = parByHole.get(hole);
        const score = scores[hole]?.[player.championshipPlayerId];
        if (holePar === undefined || score === undefined) continue;
        gross += score;
        par += holePar;
      }
      totals[player.championshipPlayerId] = { gross, toPar: gross - par };
    }
    return totals;
  }, [initialData.players, scores, currentHole, parByHole]);

  function handleConfirmSubmit() {
    setSubmitStatus("submitting");
    setSubmitError(null);
    startTransition(async () => {
      // Safety net: flush whatever hole is currently active in case the
      // golfer submits without ever navigating away from their last hole.
      const flushed = await saveHole(currentHole);
      if (!flushed) {
        setSubmitStatus("error");
        setSubmitError("Could not save your last hole — please try again.");
        return;
      }

      const result = await submitRoundGroupAction({ roundGroupId: initialData.roundGroupId });
      if (result.ok) {
        setSubmitStatus("idle");
        setReviewOpen(false);
        router.refresh();
      } else {
        setSubmitStatus("error");
        setSubmitError(result.error);
      }
    });
  }


  return (
    <div className="flex flex-1 flex-col">
      {/* Course/tee summary */}
      {(initialData.courseName || courseSummary) && (
        <div className="border-b border-emerald-900/10 bg-emerald-50 px-5 py-2.5 text-center">
          {initialData.courseName && (
            <p className="text-sm font-semibold text-emerald-950">
              {initialData.courseName}
            </p>
          )}
          {courseSummary && (
            <p className="text-xs font-medium text-emerald-800/80">
              {courseSummary}
            </p>
          )}
        </div>
      )}

      {/* Hole navigation header */}
      <div className="sticky top-[calc(env(safe-area-inset-top)+0px)] z-10 border-b border-emerald-900/10 bg-emerald-950 px-5 py-4 text-white">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Previous hole"
            disabled={currentHole === 1}
            onClick={() => goToHole(Math.max(1, currentHole - 1))}
            className="flex size-11 items-center justify-center rounded-xl bg-white/10 disabled:opacity-30"
          >
            <ChevronLeft className="size-5" />
          </button>

          <div className="text-center">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Hole {currentHole} of {TOTAL_HOLES}
            </p>
            <p className="mt-0.5 text-xl font-bold">Hole {currentHole}</p>
            {currentHoleInfo && (
              <p className="mt-0.5 text-xs font-medium text-emerald-200">
                Par {currentHoleInfo.par} · HCP {currentHoleInfo.strokeIndex}
              </p>
            )}
          </div>

          <button
            type="button"
            aria-label="Next hole"
            disabled={currentHole === TOTAL_HOLES}
            onClick={() => goToHole(Math.min(TOTAL_HOLES, currentHole + 1))}
            className="flex size-11 items-center justify-center rounded-xl bg-white/10 disabled:opacity-30"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        {/* Per-hole save status indicator */}
        <div className="mt-2 flex items-center justify-center gap-1.5 text-xs font-medium">
          {holeStatus[currentHole] === "saving" ? (
            <span className="flex items-center gap-1 text-emerald-200">
              <Loader2 className="size-3.5 animate-spin" />
              Saving hole {currentHole}…
            </span>
          ) : holeStatus[currentHole] === "error" ? (
            <button
              type="button"
              onClick={() => void saveHole(currentHole)}
              className="flex items-center gap-1 text-amber-300 underline underline-offset-2"
            >
              <TriangleAlert className="size-3.5" />
              Could not save hole {currentHole} — tap to retry
            </button>
          ) : holeStatus[currentHole] === "saved" ? (
            <span className="flex items-center gap-1 text-emerald-300">
              <CheckCircle2 className="size-3.5" />
              Hole {currentHole} saved
            </span>
          ) : (
            <span className="text-emerald-300/70">Unsaved changes</span>
          )}
        </div>

        {/* Hole progress dots */}
        <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
          {Array.from({ length: TOTAL_HOLES }, (_, i) => i + 1).map((hole) => (
            <button
              key={hole}
              type="button"
              onClick={() => goToHole(hole)}
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                hole === currentHole
                  ? "bg-emerald-400 text-emerald-950"
                  : holeStatus[hole] === "saved"
                    ? "bg-emerald-800 text-emerald-200"
                    : "bg-white/10 text-emerald-100"
              )}
            >
              {hole}
            </button>
          ))}
        </div>
      </div>

      {isReadOnly && (
        <div className="mx-5 mt-4 flex items-center gap-2 rounded-xl bg-emerald-900/10 px-4 py-3 text-emerald-900">
          <Lock className="size-4 shrink-0" />
          <p className="text-sm font-medium">
            Round submitted — scores are read-only.
          </p>
        </div>
      )}

      {/* Player score rows for the current hole */}
      <div className="flex flex-col gap-3 px-5 py-5">
        {initialData.players.map((player) => {
          const isSkippedRound = skippedRoundIds.has(player.championshipPlayerId);
          const isEditable = !isReadOnly && editablePlayerIds.has(player.championshipPlayerId);
          const value = getValue(currentHole, player.championshipPlayerId);
          const canToggleSkip = !isReadOnly && player.participantStatus === "ACTIVE";

          return (
            <div
              key={player.championshipPlayerId}
              className={cn(
                "rounded-2xl bg-card p-4 ring-1 ring-foreground/10",
                !isEditable && "opacity-60"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {player.displayName}
                    {player.memberId === currentMemberId ? (
                      <span className="ml-2 text-xs font-normal text-emerald-700">
                        You
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Handicap {player.frozenHandicap ?? "—"}
                    {player.participantStatus !== "ACTIVE" ? (
                      <span className="ml-2">
                        <Badge variant="destructive" className="align-middle">
                          {player.participantStatus}
                        </Badge>
                      </span>
                    ) : isSkippedRound ? (
                      <span className="ml-2">
                        <Badge variant="outline" className="align-middle">
                          Skipped this round
                        </Badge>
                      </span>
                    ) : null}
                  </p>
                  {(() => {
                    const running = runningTotals[player.championshipPlayerId];
                    if (!running || isSkippedRound) return null;
                    const sign = running.toPar > 0 ? "+" : running.toPar < 0 ? "" : "E";
                    return (
                      <p className="mt-0.5 text-xs font-semibold text-emerald-800">
                        Thru {currentHole} · {running.gross} ({sign}
                        {running.toPar !== 0 ? running.toPar : ""})
                      </p>
                    );
                  })()}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Decrease score for ${player.displayName}`}
                      disabled={!isEditable || value === null}
                      onClick={() => adjust(player.championshipPlayerId, -1)}
                      className="flex size-11 items-center justify-center rounded-xl bg-emerald-900/10 text-emerald-900 disabled:opacity-30"
                    >
                      <Minus className="size-5" />
                    </button>

                    <div className="flex w-12 items-center justify-center rounded-xl bg-emerald-950 py-2 text-lg font-bold tabular-nums text-white">
                      {isSkippedRound ? "–" : value === null ? "—" : value}
                    </div>

                    <button
                      type="button"
                      aria-label={`Increase score for ${player.displayName}`}
                      disabled={!isEditable}
                      onClick={() => adjust(player.championshipPlayerId, 1)}
                      className="flex size-11 items-center justify-center rounded-xl bg-emerald-900/10 text-emerald-900 disabled:opacity-30"
                    >
                      <Plus className="size-5" />
                    </button>
                  </div>

                  {canToggleSkip && (
                    <button
                      type="button"
                      disabled={skipPendingId === player.championshipPlayerId}
                      onClick={() =>
                        toggleRoundSkip(player.championshipPlayerId, !isSkippedRound)
                      }
                      className={cn(
                        "flex items-center gap-1 rounded-lg px-2 py-1 text-[0.65rem] font-semibold disabled:opacity-50",
                        isSkippedRound
                          ? "bg-emerald-900/10 text-emerald-800"
                          : "bg-destructive/10 text-destructive"
                      )}
                    >
                      {isSkippedRound ? (
                        <>
                          <UserCheck className="size-3" /> Include
                        </>
                      ) : (
                        <>
                          <UserX className="size-3" /> Skip round
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {skipError && (
        <div className="mx-5 -mt-3 mb-3 flex items-start gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p className="text-sm font-medium">{skipError}</p>
        </div>
      )}

      {/* Review + Confirm & Submit Round */}
      {!isReadOnly && (
        <div className="mx-5 mb-5 mt-2 rounded-2xl border-2 border-dashed border-foreground/15 p-4 text-center">
          <Sheet open={reviewOpen} onOpenChange={setReviewOpen}>
            <SheetTrigger
              render={
                <Button
                  disabled={!canSubmit}
                  className="h-11 w-full rounded-xl text-sm font-semibold"
                />
              }
            >
              Confirm &amp; Submit Round
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Review round before submitting</SheetTitle>
                <SheetDescription>
                  Double-check every player&apos;s total, then confirm. Submitting
                  locks normal editing — an Admin can still correct scores later
                  if needed.
                </SheetDescription>
              </SheetHeader>

              <div className="flex flex-col gap-2 px-4">
                {playerCompleteness.map(({ player, result }) => (
                  <div
                    key={player.championshipPlayerId}
                    className="flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10"
                  >
                    <p className="truncate text-sm font-medium text-foreground">
                      {player.displayName}
                    </p>
                    {result.isComplete ? (
                      <p className="text-sm font-semibold tabular-nums text-emerald-700">
                        {result.grossTotal}
                      </p>
                    ) : (
                      <p className="text-xs font-medium text-destructive">
                        {result.missingHoles.length} hole
                        {result.missingHoles.length === 1 ? "" : "s"} missing
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {submitStatus === "error" && submitError && (
                <div className="mx-4 flex items-start gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-destructive">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <p className="text-sm font-medium">{submitError}</p>
                </div>
              )}

              <SheetFooter>
                <Button
                  disabled={!allComplete || isPending}
                  onClick={handleConfirmSubmit}
                  className="h-11 w-full rounded-xl text-sm font-semibold"
                >
                  {submitStatus === "submitting" || isPending ? "Submitting…" : "Confirm & Submit"}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <p className="mt-2 text-xs text-muted-foreground">
            {anyHoleSaving
              ? "Saving your last hole…"
              : anyHoleError
                ? "Some holes could not be saved — revisit them to retry."
                : allComplete
                  ? "All scores entered — ready to submit."
                  : `${totalMissingScores} score${totalMissingScores === 1 ? "" : "s"} still missing.`}
          </p>
        </div>
      )}
    </div>
  );
}
