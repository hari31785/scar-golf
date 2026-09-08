"use client";

import Link from "next/link";
import { ArrowLeft, MapPin, Users } from "lucide-react";
import type {
  ImportedYearSummary,
  ImportedRoundGroupSummary,
} from "@/lib/handicap/page-data";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ImportedYearClient({
  year,
  groups,
}: {
  year: ImportedYearSummary;
  groups: ImportedRoundGroupSummary[];
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-emerald-900/10 bg-emerald-50 px-5 py-3">
        <Link
          href="/history"
          className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-800/80"
        >
          <ArrowLeft className="size-3.5" />
          Back to History
        </Link>
        <p className="text-lg font-bold text-emerald-950">{year.label}</p>
        {year.locationSummary && (
          <div className="mt-1 flex items-center gap-1.5 text-sm text-emerald-900/80">
            <MapPin className="size-3.5" />
            <span>{year.locationSummary}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 px-5 pt-5">
        {groups.map((g) => (
          <Link
            key={g.groupId}
            href={`/history/imported/${year.year}/${g.groupId}`}
            className="flex flex-col gap-1 rounded-2xl bg-card px-4 py-3 ring-1 ring-foreground/10 transition active:scale-[0.99]"
          >
            <p className="text-sm font-semibold text-foreground">
              {g.courseName}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDate(g.playedAt)}
            </p>
            <p className="text-xs text-muted-foreground">
              Rating {g.courseRating} · Slope {g.slope}
            </p>
            <div className="mt-1 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="size-3.5" />
                <span>
                  {g.playerCount} {g.playerCount === 1 ? "Player" : "Players"}
                </span>
              </div>
              <span className="text-xs font-semibold text-emerald-800">
                View Results →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
