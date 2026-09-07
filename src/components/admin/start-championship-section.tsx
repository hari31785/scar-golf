"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { AdminChampionshipSummary } from "@/lib/admin/championship-data";
import type { RoundSetupSummary } from "@/lib/admin/round-setup-data";
import { startChampionshipAction } from "@/lib/admin/championship-actions";

export function StartChampionshipSection({
  championship,
  rounds,
}: {
  championship: AdminChampionshipSummary;
  rounds: RoundSetupSummary[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (championship.status !== "DRAFT") return null;

  // UX-only readiness check — the backend `startChampionship` service
  // remains the sole source of truth for whether starting is actually
  // allowed; this only prevents an obviously-doomed attempt.
  const allRoundsReady = rounds.length === 4 && rounds.every((r) => r.status === "ready");
  const hasActiveParticipant = championship.activeParticipantCount > 0;
  const isReady = allRoundsReady && hasActiveParticipant;

  const reasons: string[] = [];
  if (!hasActiveParticipant) reasons.push("at least one active participant is required");
  if (!allRoundsReady) reasons.push("all 4 rounds must be Ready");

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await startChampionshipAction({ championshipId: championship.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      setOpen(false);
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <h2 className="text-sm font-semibold text-foreground">Start Championship</h2>

      {!isReady && (
        <p className="text-xs text-muted-foreground">
          Not ready yet — {reasons.join(" and ")}.
        </p>
      )}

      {success && (
        <p className="text-xs font-medium text-emerald-700">
          Championship started — Round 1 pairings generated.
        </p>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button
              disabled={!isReady || isPending}
              className="h-11 w-full rounded-xl text-sm font-semibold"
            />
          }
        >
          Start Championship
        </SheetTrigger>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" />
              Start this championship?
            </SheetTitle>
            <SheetDescription>
              This action cannot be undone. Starting will:
            </SheetDescription>
          </SheetHeader>

          <ul className="flex flex-col gap-1.5 px-4 text-sm text-foreground">
            <li>• Freeze each participant&apos;s tournament handicap</li>
            <li>• Lock participant membership changes</li>
            <li>• Freeze course/tee/hole setup for all 4 rounds</li>
            <li>• Activate the championship</li>
            <li>• Generate Round 1 pairings</li>
          </ul>

          {error && <p className="mx-4 text-xs font-medium text-destructive">{error}</p>}

          <SheetFooter>
            <Button
              disabled={isPending}
              onClick={handleConfirm}
              className="h-11 w-full rounded-xl text-sm font-semibold"
            >
              {isPending ? "Starting…" : "Yes, start championship"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </section>
  );
}
