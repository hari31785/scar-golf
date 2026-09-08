"use client";

import { Badge } from "@/components/ui/badge";
import type { MemberDirectoryRow } from "@/lib/handicap/page-data";

function membershipLabel(type: "PERMANENT" | "ASSOCIATE") {
  return type === "PERMANENT" ? "Permanent" : "Associate";
}

export function MembersClient({ rows }: { rows: MemberDirectoryRow[] }) {
  return (
    <div className="flex flex-1 flex-col gap-2 px-5 pt-5">
      {rows.map((row) => (
        <div
          key={row.memberId}
          className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 ring-1 ring-foreground/10"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {row.displayName}
            </p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <Badge variant="outline">{membershipLabel(row.membershipType)}</Badge>
              {row.appRole === "ADMIN" && <Badge variant="secondary">Admin</Badge>}
            </div>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <span className="text-lg font-bold text-emerald-950">
              {row.finalHandicap}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
