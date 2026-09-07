"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Lock, Minus, Plus, TriangleAlert } from "lucide-react";
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
import { saveHoleScoreAction, submitRoundGroupAction } from "./actions";

type FoundResult = Extract<CurrentGroupResult, { state: "found" }>;

const TOTAL_HOLES = 18;
const MIN_SCORE = 1;
const MAX_SCORE = 20;

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function ScoreEntryClient({
  initialData,
  currentMemberId,
}: {
  initialData: FoundResult;
  currentMemberId: string;
}) {
  const isReadOnly = initialData.groupStatus === "SUBMITTED";
  const router = useRouter();

  const [currentHole, setCurrentHole] = useState(1);
  const [scores, setScores] = useState<HoleScoresByHole>(initialData.scores);
  const [statusByPlayer, setStatusByPlayer] = useState<Record<string, SaveStatus>>({});
  const [isPending, startTransition] = useTransition();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const editablePlayerIds = useMemo(
    () =>
      new Set(
        initialData.players
          .filter((p) => p.participantStatus === "ACTIVE")
          .map((p) => p.championshipPlayerId)
      ),
    [initialData.players]
  );

  function getValue(holeNumber: number, championshipPlayerId: string): number | null {
    return scores[holeNumber]?.[championshipPlayerId] ?? null;
  }

  function setValueLocally(holeNumber: number, championshipPlayerId: string, value: number) {
    setScores((prev) => ({
      ...prev,
      [holeNumber]: { ...prev[holeNumber], [championshipPlayerId]: value },
    }));
  }

  function commitScore(championshipPlayerId: string, value: number) {
    if (isReadOnly || !editablePlayerIds.has(championshipPlayerId)) return;

    setValueLocally(currentHole, championshipPlayerId, value);
    setStatusByPlayer((prev) => ({ ...prev, [championshipPlayerId]: "saving" }));

    startTransition(async () => {
      const result = await saveHoleScoreAction({
        championshipRoundId: initialData.championshipRoundId,
        championshipPlayerId,
        holeNumber: currentHole,
        grossScore: value,
      });
      setStatusByPlayer((prev) => ({
        ...prev,
        [championshipPlayerId]: result.ok ? "saved" : "error",
      }));
    });
  }

  function adjust(championshipPlayerId: string, delta: number) {
    const current = getValue(currentHole, championshipPlayerId);
    if (current === null) {
      // Unentered state: only "+" is allowed, and it sets/saves 1.
      if (delta <= 0) return;
      commitScore(championshipPlayerId, MIN_SCORE);
      return;
    }
    const next = Math.min(MAX_SCORE, Math.max(MIN_SCORE, current + delta));
    if (next === current) return;
    commitScore(championshipPlayerId, next);
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
  // WITHDRAWN/DISQUALIFIED players never block submission.
  const activePlayers = initialData.players.filter((p) => p.participantStatus === "ACTIVE");
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

  function handleConfirmSubmit() {
    setSubmitStatus("submitting");
    setSubmitError(null);
    startTransition(async () => {
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
            onClick={() => setCurrentHole((h) => Math.max(1, h - 1))}
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
            onClick={() => setCurrentHole((h) => Math.min(TOTAL_HOLES, h + 1))}
            className="flex size-11 items-center justify-center rounded-xl bg-white/10 disabled:opacity-30"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        {/* Hole progress dots */}
        <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
          {Array.from({ length: TOTAL_HOLES }, (_, i) => i + 1).map((hole) => (
            <button
              key={hole}
              type="button"
              onClick={() => setCurrentHole(hole)}
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                hole === currentHole
                  ? "bg-emerald-400 text-emerald-950"
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
          const isEditable = !isReadOnly && editablePlayerIds.has(player.championshipPlayerId);
          const value = getValue(currentHole, player.championshipPlayerId);
          const status = statusByPlayer[player.championshipPlayerId] ?? "idle";

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
                    ) : null}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Decrease score for ${player.displayName}`}
                    disabled={!isEditable || isPending || value === null}
                    onClick={() => adjust(player.championshipPlayerId, -1)}
                    className="flex size-11 items-center justify-center rounded-xl bg-emerald-900/10 text-emerald-900 disabled:opacity-30"
                  >
                    <Minus className="size-5" />
                  </button>

                  <div className="flex w-12 items-center justify-center rounded-xl bg-emerald-950 py-2 text-lg font-bold tabular-nums text-white">
                    {value === null ? "—" : value}
                  </div>

                  <button
                    type="button"
                    aria-label={`Increase score for ${player.displayName}`}
                    disabled={!isEditable || isPending}
                    onClick={() => adjust(player.championshipPlayerId, 1)}
                    className="flex size-11 items-center justify-center rounded-xl bg-emerald-900/10 text-emerald-900 disabled:opacity-30"
                  >
                    <Plus className="size-5" />
                  </button>
                </div>
              </div>

              {isEditable && status !== "idle" ? (
                <p
                  className={cn(
                    "mt-2 text-right text-xs font-medium",
                    status === "saving" && "text-muted-foreground",
                    status === "saved" && "text-emerald-700",
                    status === "error" && "text-destructive"
                  )}
                >
                  {status === "saving" && "Saving…"}
                  {status === "saved" && "Saved"}
                  {status === "error" && "Could not save — try again"}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

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
            {allComplete
              ? "All scores entered — ready to submit."
              : `${totalMissingScores} score${totalMissingScores === 1 ? "" : "s"} still missing.`}
          </p>
        </div>
      )}
    </div>
  );
}
