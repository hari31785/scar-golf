"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "cn";
import type { LeaderboardPageData } from "@/lib/tournament/leaderboard";

type FoundData = Extract<LeaderboardPageData, { state: "found" }>;

const REFRESH_INTERVAL_MS = 10_000;

export function LeaderboardClient({
  initialData,
  currentMemberId,
}: {
  initialData: FoundData;
  currentMemberId: string;
}) {
  const router = useRouter();

  // Lightweight live refresh: every ~10s, ask the server component to
  // re-render with fresh leaderboard data. No websockets/polling libs —
  // just the existing router.refresh() pattern. Paused whenever the tab
  // isn't visible, and always cleared on unmount.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function start() {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(() => {
        router.refresh();
      }, REFRESH_INTERVAL_MS);
    }
    function stop() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        start();
      } else {
        stop();
      }
    }

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router]);

  const roundContext = initialData.tournamentComplete
    ? "Tournament Complete"
    : initialData.roundNumber
      ? `Round ${initialData.roundNumber} of ${initialData.totalRounds}`
      : null;

  return (
    <div className="flex flex-1 flex-col">
      {/* Championship + round context header */}
      <div className="border-b border-emerald-900/10 bg-emerald-50 px-5 py-3 text-center">
        <p className="text-sm font-semibold text-emerald-950">
          {initialData.championshipName} {initialData.year}
        </p>
        {roundContext && (
          <p className="text-xs font-medium text-emerald-800/80">{roundContext}</p>
        )}
      </div>

      {initialData.entries.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No active players to show yet.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-5 py-5">
          {initialData.entries.map((entry) => {
            const isLeader = entry.position === 1;
            const isTopThree = entry.position <= 3;
            const isSelf = entry.memberId === currentMemberId;

            return (
              <div
                key={entry.championshipPlayerId}
                className={cn(
                  "flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10",
                  isLeader && "bg-emerald-950 text-white ring-emerald-950",
                  !isLeader && isTopThree && "ring-2 ring-emerald-700/40"
                )}
              >
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums",
                    isLeader
                      ? "bg-emerald-400 text-emerald-950"
                      : isTopThree
                        ? "bg-emerald-900/10 text-emerald-900"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {entry.position}
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm font-semibold",
                      isLeader ? "text-white" : "text-foreground"
                    )}
                  >
                    {entry.displayName}
                    {isSelf ? (
                      <span
                        className={cn(
                          "ml-2 text-xs font-normal",
                          isLeader ? "text-emerald-200" : "text-emerald-700"
                        )}
                      >
                        You
                      </span>
                    ) : null}
                  </p>
                  <p
                    className={cn(
                      "text-xs",
                      isLeader ? "text-emerald-200" : "text-muted-foreground"
                    )}
                  >
                    HCP {entry.frozenHandicap ?? "—"} · {entry.completedRounds} round
                    {entry.completedRounds === 1 ? "" : "s"} played
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end">
                  <p
                    className={cn(
                      "text-sm font-bold tabular-nums",
                      isLeader ? "text-white" : "text-foreground"
                    )}
                  >
                    {entry.cumulativeNet}
                  </p>
                  <p
                    className={cn(
                      "text-xs tabular-nums",
                      isLeader ? "text-emerald-200" : "text-muted-foreground"
                    )}
                  >
                    Gross {entry.cumulativeGross}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
