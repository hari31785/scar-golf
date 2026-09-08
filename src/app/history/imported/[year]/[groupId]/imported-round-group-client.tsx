"use client";

import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import type { ImportedRoundGroupDetail } from "@/lib/handicap/page-data";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ImportedRoundGroupClient({
  year,
  groupId,
  detail,
}: {
  year: number;
  groupId: string;
  detail: ImportedRoundGroupDetail;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-emerald-900/10 bg-emerald-50 px-5 py-3">
        <Link
          href={`/history/imported/${year}`}
          className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-800/80"
        >
          <ArrowLeft className="size-3.5" />
          Back to {year} SCAR Championship
        </Link>
        <p className="text-sm font-semibold text-emerald-950">
          {detail.courseName}
        </p>
        <p className="mt-0.5 text-xs text-emerald-900/80">
          {formatDate(detail.playedAt)}
        </p>
        {detail.courseCity && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-900/80">
            <MapPin className="size-3.5" />
            <span>{detail.courseCity}</span>
          </div>
        )}
        <p className="mt-1 text-xs text-emerald-900/80">
          Rating {detail.courseRating} · Slope {detail.slope}
        </p>
      </div>

      <div className="px-5 pt-5">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Player Results
        </h2>
        <div className="flex flex-col gap-2">
          {detail.players.map((p) => (
            <Link
              key={p.roundId}
              href={`/history/imported/${year}/${groupId}/${p.roundId}`}
              className="flex items-center justify-between gap-3 rounded-xl bg-card px-3 py-2.5 ring-1 ring-foreground/10 transition active:scale-[0.99]"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">
                  {p.displayName}
                </span>
                <span className="text-xs text-muted-foreground">
                  Gross {p.grossScore} · Differential {p.differential.toFixed(1)}
                </span>
              </div>
              <span className="shrink-0 text-xs font-semibold text-emerald-800">
                View Round →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
