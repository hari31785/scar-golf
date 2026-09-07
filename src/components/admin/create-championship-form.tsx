"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createDraftChampionshipAction } from "@/lib/admin/championship-actions";

export function CreateChampionshipForm({ year }: { year: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [inputYear, setInputYear] = useState(String(year));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedYear = Number(inputYear);
    if (!Number.isInteger(parsedYear)) {
      setError("Enter a valid year.");
      return;
    }
    if (!name.trim()) {
      setError("Enter a championship name.");
      return;
    }

    startTransition(async () => {
      const result = await createDraftChampionshipAction({
        year: parsedYear,
        name: name.trim(),
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/admin/championship?year=${parsedYear}`);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10"
    >
      <h2 className="text-sm font-semibold text-foreground">
        No non-cancelled championship for {year} yet
      </h2>
      <p className="text-xs text-muted-foreground">
        Create a new DRAFT championship to start enrolling participants.
      </p>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Year
        <input
          type="number"
          value={inputYear}
          onChange={(e) => setInputYear(e.target.value)}
          className="h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm text-foreground"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Championship name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="SCAR Championship"
          className="h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm text-foreground"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Start date
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm text-foreground"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        End date
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm text-foreground"
        />
      </label>

      {error && <p className="text-xs font-medium text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending} className="h-11 rounded-xl text-sm font-semibold">
        {isPending ? "Creating…" : "Create draft championship"}
      </Button>
    </form>
  );
}
