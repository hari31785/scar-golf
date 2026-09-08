"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminParticipantStatusRow } from "@/lib/admin/championship-data";
import { setParticipantStatusAction } from "@/lib/admin/championship-actions";

const STATUS_OPTIONS = ["ACTIVE", "WITHDRAWN", "DISQUALIFIED"] as const;

function statusLabel(status: (typeof STATUS_OPTIONS)[number]) {
  if (status === "ACTIVE") return "Active";
  if (status === "WITHDRAWN") return "Withdrawn";
  return "DQ";
}

/**
 * Minimal ACTIVE/WITHDRAWN/DISQUALIFIED control for one championship
 * participant. Reuses the existing participantStatus enum/column and
 * setParticipantStatusAction — no new scoring/pairing logic here.
 */
export function ParticipantStatusRow({
  participant,
}: {
  participant: AdminParticipantStatusRow;
}) {
  const [status, setStatus] = useState(participant.participantStatus);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(next: (typeof STATUS_OPTIONS)[number]) {
    if (next === status) return;
    setError(null);
    const previous = status;
    setStatus(next);
    startTransition(async () => {
      const result = await setParticipantStatusAction({
        championshipPlayerId: participant.championshipPlayerId,
        status: next,
      });
      if (!result.ok) {
        setStatus(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {participant.displayName}
          </p>
          <Badge
            variant={
              status === "ACTIVE"
                ? "secondary"
                : status === "WITHDRAWN"
                  ? "outline"
                  : "destructive"
            }
            className="mt-1"
          >
            {statusLabel(status)}
          </Badge>
        </div>

        <div className="flex shrink-0 gap-1.5">
          {STATUS_OPTIONS.map((option) => (
            <Button
              key={option}
              type="button"
              variant={option === status ? "default" : "outline"}
              size="sm"
              disabled={isPending}
              onClick={() => handleChange(option)}
              className="h-7 rounded-lg px-2 text-[0.7rem]"
            >
              {statusLabel(option)}
            </Button>
          ))}
        </div>
      </div>

      {error && <p className="mt-2 text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
