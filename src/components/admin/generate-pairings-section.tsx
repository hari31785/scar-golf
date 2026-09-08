"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { generateRound1PairingAction } from "@/lib/admin/championship-actions";

/**
 * Admin-only: lets the admin generate Round 1 pairings AHEAD of
 * championship start, so players know who they're playing with (and
 * can line up carts) before the tournament actually begins. Only shown
 * while the championship is still DRAFT and Round 1 has no groups yet
 * — once pairings exist, `PairingsSection` below already displays them
 * (this section simply disappears). Reuses the exact same pairing
 * engine/rules as starting the championship; nothing is duplicated
 * here — see generateRound1PairingAction.
 */
export function GeneratePairingsSection({
  championshipRoundId,
}: {
  championshipRoundId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateRound1PairingAction({ championshipRoundId });
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <h2 className="text-sm font-semibold text-foreground">Round 1 Pairings</h2>
      <p className="text-xs text-muted-foreground">
        Generate Round 1 groups now so players can see who they&apos;re
        playing with and line up carts before the championship starts.
      </p>
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      <Button
        type="button"
        disabled={isPending}
        onClick={handleGenerate}
        className="h-11 rounded-xl text-sm font-semibold"
      >
        {isPending ? "Generating…" : "Generate Round 1 Pairings"}
      </Button>
    </section>
  );
}
