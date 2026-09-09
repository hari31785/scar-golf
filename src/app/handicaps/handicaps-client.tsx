"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { HandicapListRow } from "@/lib/handicap/page-data";

function membershipLabel(type: "PERMANENT" | "ASSOCIATE") {
  return type === "PERMANENT" ? "Permanent" : "Associate";
}

export function HandicapsClient({ rows }: { rows: HandicapListRow[] }) {
  return (
    <div className="flex flex-1 flex-col gap-2 px-5 pt-5 lg:grid lg:grid-cols-2 lg:gap-3 lg:px-8">
      {rows.map((row) => (
        <Link
          key={row.memberId}
          href={`/handicaps/${row.memberId}`}
          className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 ring-1 ring-foreground/10 transition active:scale-[0.99]"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {row.displayName}
            </p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <Badge variant="outline">{membershipLabel(row.membershipType)}</Badge>
              {row.capApplied && (
                <Badge variant="secondary">Capped</Badge>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <span className="text-lg font-bold text-emerald-950">
              {row.finalHandicap}
            </span>
            {row.capApplied && (
              <span className="text-xs text-muted-foreground">
                raw {row.roundedHandicap}
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
