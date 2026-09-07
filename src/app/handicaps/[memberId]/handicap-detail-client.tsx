"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import type { HandicapDetail } from "@/lib/handicap/page-data";

type FoundData = Extract<HandicapDetail, { state: "found" }>;

function membershipLabel(type: "PERMANENT" | "ASSOCIATE") {
  return type === "PERMANENT" ? "Permanent" : "Associate";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function HandicapDetailClient({ data }: { data: FoundData }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-emerald-900/10 bg-emerald-50 px-5 py-3">
        <Link
          href="/handicaps"
          className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-800/80"
        >
          <ArrowLeft className="size-3.5" />
          Back to Handicaps
        </Link>
        <p className="text-sm font-semibold text-emerald-950">{data.displayName}</p>
        <Badge variant="outline" className="mt-1">
          {membershipLabel(data.membershipType)}
        </Badge>
      </div>

      {/* Prominent current handicap */}
      <div className="mx-5 mt-5 flex flex-col items-center gap-1 rounded-2xl bg-emerald-950 py-6 text-white ring-1 ring-emerald-950">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
          Current SCAR Handicap
        </p>
        <p className="text-4xl font-bold">{data.finalHandicap}</p>
        {data.capApplied && (
          <p className="text-xs text-emerald-200">
            Capped from raw value {data.roundedHandicap} (max {data.maxHandicap})
          </p>
        )}
      </div>

      {/* Summary stats */}
      <div className="mx-5 mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-card px-3 py-2.5 ring-1 ring-foreground/10">
          <p className="text-xs text-muted-foreground">Raw Calculated</p>
          <p className="text-base font-semibold text-foreground">
            {data.roundedHandicap}
          </p>
        </div>
        <div className="rounded-xl bg-card px-3 py-2.5 ring-1 ring-foreground/10">
          <p className="text-xs text-muted-foreground">Max Handicap</p>
          <p className="text-base font-semibold text-foreground">
            {data.maxHandicap}
          </p>
        </div>
        <div className="rounded-xl bg-card px-3 py-2.5 ring-1 ring-foreground/10">
          <p className="text-xs text-muted-foreground">Qualifying Rounds</p>
          <p className="text-base font-semibold text-foreground">
            {data.actualRoundCount}
          </p>
        </div>
        <div className="rounded-xl bg-card px-3 py-2.5 ring-1 ring-foreground/10">
          <p className="text-xs text-muted-foreground">Padding Used</p>
          <p className="text-base font-semibold text-foreground">
            {data.paddingCount}
          </p>
        </div>
      </div>

      {/* Calculation transparency */}
      {data.calculationRounds.length > 0 && (
        <div className="px-5 pt-6">
          <h2 className="mb-1 text-sm font-semibold text-foreground">
            20-Round Calculation
          </h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Formula: (Gross − Rating) × 113 ÷ Slope. The lowest 8 differentials
            (marked &ldquo;Used&rdquo;) are averaged to compute the handicap.
          </p>

          <div className="flex flex-col gap-1.5">
            {data.calculationRounds.map((round, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex flex-col gap-1 rounded-xl px-3 py-2.5 ring-1",
                  round.isUsedInLowest8
                    ? "bg-emerald-50 ring-emerald-900/20"
                    : "bg-card ring-foreground/10"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {formatDate(round.playedAt)}
                    {round.courseName ? ` · ${round.courseName}` : ""}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    {round.isPadding && <Badge variant="secondary">Padding</Badge>}
                    {round.isUsedInLowest8 && (
                      <Badge variant="default">Used</Badge>
                    )}
                  </div>
                </div>
                {round.isPadding && (
                  <p className="text-xs italic text-muted-foreground">
                    Calculation-only padding — not a played round
                  </p>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>Gross {round.grossScore}</span>
                  <span>Rating {round.courseRating}</span>
                  <span>Slope {round.slope}</span>
                  <span className="font-semibold text-foreground">
                    Diff {round.differential.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-1.5 rounded-xl bg-card px-3 py-2.5 ring-1 ring-foreground/10">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Lowest-8 average</span>
              <span className="font-semibold text-foreground">
                {data.rawAverageLowest8.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Rounded up</span>
              <span className="font-semibold text-foreground">
                {data.roundedHandicap}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Final (capped)</span>
              <span className="font-semibold text-foreground">
                {data.finalHandicap}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Historical rounds */}
      <div className="px-5 py-6">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Historical Rounds
        </h2>
        {data.historicalRounds.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No historical rounds recorded yet.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {data.historicalRounds.map((round) => (
              <div
                key={round.id}
                className="flex flex-col gap-1 rounded-xl bg-card px-3 py-2.5 ring-1 ring-foreground/10"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {formatDate(round.playedAt)}
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {round.grossScore}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {round.courseName}
                  {round.courseCity ? ` · ${round.courseCity}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  Rating {round.courseRating} · Slope {round.slope}
                  {round.par ? ` · Par ${round.par}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
