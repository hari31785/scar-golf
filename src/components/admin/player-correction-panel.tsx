"use client";

import { useEffect, useState, useTransition } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  loadPlayerCorrectionDataAction,
  correctHoleScoreAction,
  type LoadPlayerCorrectionDataResult,
} from "@/lib/admin/correction-actions";
import type {
  CorrectionHoleRow,
  CorrectionAuditRow,
} from "@/lib/tournament/scoring/correction-data";
import { isValidGrossScore } from "@/lib/tournament/scoring/completeness";

type LoadedData = Extract<LoadPlayerCorrectionDataResult, { ok: true }>;

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Admin-only panel: loads one player's SUBMITTED scorecard for one
 * round, lets the admin correct a single hole (with a required reason
 * and a confirmation step), and shows the recent correction history for
 * that player/round. All writes go through the existing
 * `correctSubmittedHoleScore` service via `correctHoleScoreAction` —
 * this component never touches the database directly.
 */
export function PlayerCorrectionPanel({
  championshipRoundId,
  roundNumber,
  championshipPlayerId,
  displayName,
}: {
  championshipRoundId: string;
  roundNumber: number;
  championshipPlayerId: string;
  displayName: string;
}) {
  const [data, setData] = useState<LoadedData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [editingHole, setEditingHole] = useState<CorrectionHoleRow | null>(null);
  const [newScoreInput, setNewScoreInput] = useState("");
  const [reasonInput, setReasonInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const [confirmingHole, setConfirmingHole] = useState<{
    hole: CorrectionHoleRow;
    newScore: number;
    reason: string;
  } | null>(null);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    loadPlayerCorrectionDataAction({ championshipRoundId, championshipPlayerId }).then(
      (result) => {
        if (cancelled) return;
        if (!result.ok) {
          setLoadError(result.error);
        } else {
          setData(result);
        }
        setIsLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [championshipRoundId, championshipPlayerId]);

  function beginEdit(hole: CorrectionHoleRow) {
    setEditingHole(hole);
    setNewScoreInput(String(hole.grossScore));
    setReasonInput("");
    setValidationError(null);
    setSuccessMessage(null);
  }

  function cancelEdit() {
    setEditingHole(null);
    setNewScoreInput("");
    setReasonInput("");
    setValidationError(null);
  }

  function handleReviewCorrection() {
    if (!editingHole) return;
    const parsed = Number(newScoreInput);
    if (!isValidGrossScore(parsed)) {
      setValidationError("Enter a valid score (1–20).");
      return;
    }
    if (!reasonInput.trim()) {
      setValidationError("A correction reason is required.");
      return;
    }
    setValidationError(null);
    setConfirmingHole({ hole: editingHole, newScore: parsed, reason: reasonInput.trim() });
  }

  function handleConfirmSave() {
    if (!confirmingHole) return;
    setSaveError(null);
    startSaving(async () => {
      const result = await correctHoleScoreAction({
        holeScoreId: confirmingHole.hole.holeScoreId,
        newGrossScore: confirmingHole.newScore,
        reason: confirmingHole.reason,
        championshipRoundId,
        championshipPlayerId,
      });
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setData({ ok: true, scorecard: result.scorecard, history: result.history });
      setConfirmingHole(null);
      setEditingHole(null);
      setSuccessMessage(`Hole ${confirmingHole.hole.holeNumber} corrected.`);
    });
  }

  if (isLoading) {
    return (
      <p className="text-xs text-muted-foreground">Loading scorecard…</p>
    );
  }

  if (loadError) {
    return <p className="text-xs font-medium text-destructive">{loadError}</p>;
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-4 border-t border-foreground/10 pt-3">
      <p className="text-sm font-semibold text-foreground">
        {displayName} · Round {roundNumber}
      </p>

      {data.scorecard.state === "not-submitted" ? (
        <p className="text-xs text-muted-foreground">
          This player has not submitted a scorecard for this round yet.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1.5 text-xs font-semibold text-muted-foreground">
            <span>Hole</span>
            <span>Par</span>
            <span>Score</span>
          </div>
          <div className="flex flex-col gap-1">
            {data.scorecard.holes.map((hole) => (
              <div key={hole.holeScoreId} className="flex flex-col gap-1.5">
                <div className="grid grid-cols-3 items-center gap-1.5">
                  <span className="text-sm text-foreground">{hole.holeNumber}</span>
                  <span className="text-sm text-muted-foreground">
                    {hole.par ?? "—"}
                  </span>
                  <button
                    type="button"
                    onClick={() => beginEdit(hole)}
                    className="w-fit rounded-lg bg-muted/60 px-2.5 py-1 text-left text-sm font-semibold text-foreground ring-1 ring-foreground/10 active:scale-95"
                  >
                    {hole.grossScore}
                  </button>
                </div>

                {editingHole?.holeScoreId === hole.holeScoreId && (
                  <div className="flex flex-col gap-2 rounded-xl bg-muted/40 p-3 ring-1 ring-foreground/10">
                    <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
                      New score
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={newScoreInput}
                        onChange={(e) => setNewScoreInput(e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
                      Reason
                      <textarea
                        value={reasonInput}
                        onChange={(e) => setReasonInput(e.target.value)}
                        rows={2}
                        className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder="Why is this being corrected?"
                      />
                    </label>
                    {validationError && (
                      <p className="text-xs font-medium text-destructive">
                        {validationError}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="flex-1"
                        onClick={handleReviewCorrection}
                      >
                        Review Correction
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={cancelEdit}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2">
            <span className="text-xs font-semibold text-emerald-900">
              Gross Total
            </span>
            <span className="text-sm font-bold text-emerald-950">
              {data.scorecard.grossTotal}
            </span>
          </div>
        </>
      )}

      {successMessage && (
        <p className="text-xs font-medium text-emerald-700">{successMessage}</p>
      )}

      {/* Recent correction history */}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold text-foreground">
          Recent Corrections
        </p>
        {data.history.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No corrections recorded for this player/round.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {data.history.map((entry: CorrectionAuditRow) => (
              <div
                key={entry.id}
                className="rounded-lg bg-muted/40 px-2.5 py-2 text-xs ring-1 ring-foreground/10"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">
                    Hole {entry.holeNumber}: {entry.originalGrossScore} →{" "}
                    {entry.newGrossScore}
                  </span>
                  <span className="text-muted-foreground">
                    {formatTimestamp(entry.changedAt)}
                  </span>
                </div>
                {entry.reason && (
                  <p className="mt-0.5 text-muted-foreground">{entry.reason}</p>
                )}
                <p className="mt-0.5 text-muted-foreground">
                  By {entry.changedByDisplayName}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation dialog */}
      <Dialog
        open={confirmingHole !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmingHole(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Correction</DialogTitle>
            <DialogDescription>
              Review the change before it&apos;s applied. This creates a
              permanent audit entry.
            </DialogDescription>
          </DialogHeader>

          {confirmingHole && (
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Player</span>
                <span className="font-medium text-foreground">{displayName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Round</span>
                <span className="font-medium text-foreground">{roundNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Hole</span>
                <span className="font-medium text-foreground">
                  {confirmingHole.hole.holeNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Old Score</span>
                <span className="font-medium text-foreground">
                  {confirmingHole.hole.grossScore}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">New Score</span>
                <span className="font-medium text-foreground">
                  {confirmingHole.newScore}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">Reason</span>
                <span className={cn("font-medium text-foreground")}>
                  {confirmingHole.reason}
                </span>
              </div>
            </div>
          )}

          {saveError && (
            <p className="text-xs font-medium text-destructive">{saveError}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmingHole(null)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirmSave} disabled={isSaving}>
              {isSaving ? "Saving…" : "Apply Correction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
