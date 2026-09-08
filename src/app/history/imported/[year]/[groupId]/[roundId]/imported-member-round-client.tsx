"use client";

import Link from "next/link";
import { ArrowLeft, MapPin, Info } from "lucide-react";
import type { ImportedRoundDisplay } from "@/lib/handicap/page-data";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ImportedMemberRoundClient({
  round,
  year,
  groupId,
}: {
  round: ImportedRoundDisplay;
  year: string;
  groupId: string;
}) {
  const championshipYear = new Date(round.playedAt).getFullYear();

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-emerald-900/10 bg-emerald-50 px-5 py-3">
        <Link
          href={`/history/imported/${year}/${groupId}`}
          className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-800/80"
        >
          <ArrowLeft className="size-3.5" />
          Back to Results
        </Link>
        <p className="text-sm font-semibold text-emerald-950">
          {round.displayName}
        </p>
        <p className="mt-0.5 text-xs text-emerald-900/80">
          {championshipYear} SCAR Championship
        </p>
      </div>

      <div className="flex flex-col gap-2 px-5 pt-5">
        <div className="rounded-2xl bg-card px-4 py-3 ring-1 ring-foreground/10">
          <p className="text-sm font-semibold text-foreground">
            {round.courseName}
          </p>
          {round.courseCity && (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5" />
              <span>{round.courseCity}</span>
            </div>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(round.playedAt)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Gross <span className="font-semibold text-foreground">{round.grossScore}</span>
            </span>
            <span>
              Rating <span className="font-semibold text-foreground">{round.courseRating}</span>
            </span>
            <span>
              Slope <span className="font-semibold text-foreground">{round.slope}</span>
            </span>
            <span>
              Differential{" "}
              <span className="font-semibold text-foreground">
                {round.differential.toFixed(1)}
              </span>
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-muted/60 px-4 py-6 text-center ring-1 ring-foreground/10">
          <Info className="size-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">
            Hole-by-hole scorecard unavailable
          </p>
          <p className="max-w-xs text-xs text-muted-foreground">
            This round was imported from SCAR&apos;s historical records. The
            original hole-by-hole scorecard is not available.
          </p>
        </div>
      </div>
    </div>
  );
}
