"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { AdminChampionshipSummary } from "@/lib/admin/championship-data";
import { updateChampionshipDetailsAction } from "@/lib/admin/championship-actions";
import { formatCalendarDate } from "@/lib/format-date";

/** Converts an ISO datetime string to a `YYYY-MM-DD` value for a date input. */
function toDateInputValue(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function ChampionshipSummaryCard({
  championship,
}: {
  championship: AdminChampionshipSummary;
}) {
  const isDraft = championship.status === "DRAFT";
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(championship.name);
  const [startDate, setStartDate] = useState(toDateInputValue(championship.startDate));
  const [endDate, setEndDate] = useState(toDateInputValue(championship.endDate));

  function handleCancel() {
    setError(null);
    setName(championship.name);
    setStartDate(toDateInputValue(championship.startDate));
    setEndDate(toDateInputValue(championship.endDate));
    setIsEditing(false);
  }

  function handleSave() {
    setError(null);
    if (!name.trim()) {
      setError("Enter a championship name.");
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setError("End date must not be before start date.");
      return;
    }
    startTransition(async () => {
      const result = await updateChampionshipDetailsAction({
        championshipId: championship.id,
        name: name.trim(),
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIsEditing(false);
    });
  }

  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 w-full rounded-xl border border-foreground/15 bg-background px-3 text-sm font-semibold text-foreground"
            />
          ) : (
            <p className="truncate text-base font-semibold text-foreground">
              {championship.name}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">{championship.year}</p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-900/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-emerald-900">
          {championship.status}
        </span>
      </div>

      {isEditing ? (
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Start
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-10 rounded-xl border border-foreground/15 bg-background px-2 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            End
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-10 rounded-xl border border-foreground/15 bg-background px-2 text-sm text-foreground"
            />
          </label>
        </div>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Start</dt>
            <dd className="font-medium text-foreground">{formatCalendarDate(championship.startDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">End</dt>
            <dd className="font-medium text-foreground">{formatCalendarDate(championship.endDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Participants</dt>
            <dd className="font-medium text-foreground">{championship.participantCount}</dd>
          </div>
        </dl>
      )}

      {error && <p className="mt-2 text-xs font-medium text-destructive">{error}</p>}

      {isDraft && (
        <div className="mt-3 flex items-center gap-2">
          {isEditing ? (
            <>
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={handleSave}
                className="h-8 rounded-lg px-3 text-xs"
              >
                {isPending ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={handleCancel}
                className="h-8 rounded-lg px-3 text-xs"
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="h-8 rounded-lg px-3 text-xs"
            >
              Edit Details
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

