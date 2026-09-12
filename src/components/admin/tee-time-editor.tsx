"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChampionshipRoundPairings } from "@/lib/tournament/pairing-summary";
import { saveTeeTimesAction } from "@/lib/admin/championship-actions";

function isoToLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  // datetime-local input needs "YYYY-MM-DDTHH:mm" in local time.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputValueToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function TeeTimeEditor({ round }: { round: ChampionshipRoundPairings }) {
  const initialTeeTimes = useMemo(() => {
    const initial: Record<string, string> = {};
    for (const group of round.groups) {
      initial[group.roundGroupId] = isoToLocalInputValue(group.teeTime);
    }
    return initial;
  }, [round.groups]);

  const [teeTimes, setTeeTimes] = useState<Record<string, string>>(initialTeeTimes);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (round.groups.length === 0) {
    return (
      <div className="rounded-2xl bg-card p-4 text-center ring-1 ring-foreground/10">
        <p className="text-sm text-muted-foreground">
          Round {round.roundNumber} pairings have not been generated yet.
        </p>
      </div>
    );
  }

  function handleSave() {
    setError(null);
    setSuccess(false);

    // Only send updates for groups whose value actually changed since
    // load — never silently overwrite an already-saved tee time with a
    // blank value just because a field happened to render empty.
    const changedUpdates = round.groups
      .filter((group) => (teeTimes[group.roundGroupId] ?? "") !== (initialTeeTimes[group.roundGroupId] ?? ""))
      .map((group) => ({
        roundGroupId: group.roundGroupId,
        teeTime: localInputValueToIso(teeTimes[group.roundGroupId] ?? ""),
      }));

    if (changedUpdates.length === 0) {
      setSuccess(true);
      return;
    }

    // Confirm before clearing any group's tee time that was previously
    // set — this is the one destructive case (setting a NEW time never
    // needs confirmation).
    const clearingGroups = changedUpdates.filter(
      (u) => u.teeTime === null && (initialTeeTimes[u.roundGroupId] ?? "") !== ""
    );
    if (clearingGroups.length > 0) {
      const groupNumbers = clearingGroups
        .map((u) => round.groups.find((g) => g.roundGroupId === u.roundGroupId)?.groupNumber)
        .filter((n): n is number => n !== undefined)
        .join(", ");
      const confirmed = window.confirm(
        `This will clear the tee time for Group ${groupNumbers} in Round ${round.roundNumber}. Continue?`
      );
      if (!confirmed) return;
    }

    startTransition(async () => {
      const result = await saveTeeTimesAction({
        championshipRoundId: round.championshipRoundId,
        updates: changedUpdates,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(true);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <h3 className="text-sm font-semibold text-foreground">Round {round.roundNumber}</h3>

      <div className="flex flex-col gap-3">
        {round.groups.map((group) => (
          <div key={group.roundGroupId} className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-foreground">Group {group.groupNumber}</p>
            <div className="flex flex-col gap-0.5">
              {Object.entries(
                group.players
                  .slice()
                  .sort((a, b) => a.position - b.position)
                  .reduce<Record<string, string[]>>((acc, p) => {
                    const key = String(p.cartNumber ?? "—");
                    (acc[key] ??= []).push(p.displayName);
                    return acc;
                  }, {})
              ).map(([cartNumber, names]) => (
                <p key={cartNumber} className="truncate text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/70">Cart {cartNumber}: </span>
                  {names.join(", ")}
                </p>
              ))}
            </div>
            <Input
              type="datetime-local"
              value={teeTimes[group.roundGroupId] ?? ""}
              onChange={(e) =>
                setTeeTimes((prev) => ({ ...prev, [group.roundGroupId]: e.target.value }))
              }
            />
          </div>
        ))}
      </div>

      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      {success && <p className="text-xs font-medium text-emerald-700">Tee times saved.</p>}

      <Button
        type="button"
        disabled={isPending}
        onClick={handleSave}
        className="h-11 rounded-xl text-sm font-semibold"
      >
        {isPending ? "Saving…" : "Save Tee Times"}
      </Button>
    </div>
  );
}
