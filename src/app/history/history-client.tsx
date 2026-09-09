"use client";

import Link from "next/link";
import { Trophy, MapPin, Users, CalendarDays } from "lucide-react";
import type { HistoryChampionshipSummary } from "@/lib/tournament/history";
import { formatCalendarDate } from "@/lib/format-date";

function formatDateRange(startDate: string | null, endDate: string | null) {
  if (!startDate && !endDate) return null;
  // Month/day only (no year) for the compact range display — still
  // timezone-safe via the shared UTC-anchored calendar formatter.
  const fmt = (iso: string) => formatCalendarDate(iso).replace(/, \d{4}$/, "");
  if (startDate && endDate) return `${fmt(startDate)} – ${fmt(endDate)}`;
  return fmt(startDate ?? endDate!);
}

export function HistoryClient({
  championships,
}: {
  championships: HistoryChampionshipSummary[];
}) {
  return (
    <div className="flex flex-1 flex-col gap-3 px-5 pt-5 lg:grid lg:grid-cols-2 lg:gap-3 lg:px-8">
      {championships.map((c) => {
        const dateRange = formatDateRange(c.startDate, c.endDate);
        return (
          <Link
            key={c.championshipId}
            href={`/history/${c.championshipId}`}
            className="flex flex-col gap-2 rounded-2xl bg-card px-4 py-4 ring-1 ring-foreground/10 transition active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800/70">
                  {c.year}
                </p>
                <p className="text-base font-semibold text-foreground">
                  {c.name}
                </p>
              </div>
              {c.championDisplayName && (
                <div className="flex items-center gap-1.5 rounded-full bg-emerald-950 px-2.5 py-1 text-white">
                  <Trophy className="size-3.5" />
                  <span className="text-xs font-semibold">
                    {c.championDisplayName}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              {dateRange && (
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" />
                  <span>{dateRange}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Users className="size-3.5" />
                <span>
                  {c.participantCount}{" "}
                  {c.participantCount === 1 ? "participant" : "participants"}
                </span>
              </div>
              {c.locationSummary && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="size-3.5" />
                  <span>{c.locationSummary}</span>
                </div>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
