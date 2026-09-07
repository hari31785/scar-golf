"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AdminChampionshipMemberRow } from "@/lib/admin/championship-data";
import { addParticipantAction, removeParticipantAction } from "@/lib/admin/championship-actions";

export function ChampionshipParticipantRow({
  member,
  championshipId,
  canMutate,
}: {
  member: AdminChampionshipMemberRow;
  championshipId: string;
  canMutate: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      const result = member.isAdded
        ? await removeParticipantAction({ championshipId, memberId: member.memberId })
        : await addParticipantAction({ championshipId, memberId: member.memberId });
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{member.displayName}</p>
          <Badge variant={member.isAdded ? "default" : "outline"} className="mt-1">
            {member.isAdded ? "Added" : "Not added"}
          </Badge>
        </div>

        {canMutate && (
          <Button
            type="button"
            variant={member.isAdded ? "outline" : "default"}
            disabled={isPending}
            onClick={handleToggle}
            className="h-9 shrink-0 rounded-xl px-4 text-xs font-semibold"
          >
            {isPending ? "…" : member.isAdded ? "Remove" : "Add"}
          </Button>
        )}
      </div>

      {error && <p className="mt-2 text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
