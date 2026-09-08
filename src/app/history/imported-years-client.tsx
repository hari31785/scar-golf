"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
import type { ImportedYearSummary } from "@/lib/handicap/page-data";

export function ImportedYearsClient({ years }: { years: ImportedYearSummary[] }) {
  return (
    <div className="flex flex-1 flex-col gap-3 px-5 pt-5">
      {years.map((y) => (
        <Link
          key={y.year}
          href={`/history/imported/${y.year}`}
          className="flex flex-col gap-1 rounded-2xl bg-card px-4 py-4 ring-1 ring-foreground/10 transition active:scale-[0.99]"
        >
          <p className="text-lg font-bold text-foreground">{y.label}</p>
          {y.locationSummary && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-3.5" />
              <span>{y.locationSummary}</span>
            </div>
          )}
          <span className="mt-1 text-xs font-semibold text-emerald-800">
            View Championship →
          </span>
        </Link>
      ))}
    </div>
  );
}
