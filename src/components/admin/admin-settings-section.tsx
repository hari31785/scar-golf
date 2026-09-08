"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateMaxHandicapAction } from "@/lib/admin/settings-actions";

export function AdminSettingsSection({ initialMaxHandicap }: { initialMaxHandicap: number }) {
  const [value, setValue] = useState(String(initialMaxHandicap));
  const [saved, setSaved] = useState(initialMaxHandicap);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    setSuccess(false);
    const parsed = Number(value);
    startTransition(async () => {
      const result = await updateMaxHandicapAction(parsed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(result.maxHandicap);
      setSuccess(true);
    });
  }

  return (
    <section id="settings" className="flex flex-col gap-2 scroll-mt-24">
      <h2 className="px-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Settings
      </h2>

      <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        <div>
          <p className="text-sm font-semibold text-foreground">Maximum Handicap</p>
          <p className="text-xs text-muted-foreground">Current value: {saved}</p>
        </div>

        <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
          New maximum handicap
          <Input
            type="number"
            min={1}
            max={54}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>

        <p className="text-xs text-muted-foreground">
          Changes affect future handicap calculations and future championship
          freezes. Existing frozen championship handicaps are not changed.
        </p>

        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        {success && <p className="text-xs font-medium text-emerald-700">Saved.</p>}

        <Button
          type="button"
          disabled={isPending}
          onClick={handleSave}
          className="h-11 rounded-xl text-sm font-semibold"
        >
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </section>
  );
}
