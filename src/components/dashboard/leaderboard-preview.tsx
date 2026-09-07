import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Player } from "@/lib/mock-data";
import { ChevronRight, Trophy } from "lucide-react";
import Link from "next/link";

function positionColor(position: number) {
  if (position === 1) return "bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950";
  if (position === 2) return "bg-gradient-to-br from-zinc-200 to-zinc-400 text-zinc-800";
  if (position === 3) return "bg-gradient-to-br from-orange-300 to-orange-500 text-orange-950";
  return "bg-muted text-muted-foreground";
}

export function LeaderboardPreview({ players }: { players: Player[] }) {
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Trophy className="size-4 text-amber-500" />
          Leaderboard
        </h3>
        <Link
          href="/leaderboard"
          className="flex items-center gap-0.5 text-xs font-medium text-emerald-700"
        >
          Full standings
          <ChevronRight className="size-3.5" />
        </Link>
      </div>

      {players.length === 0 ? (
        <p className="mt-3 py-6 text-center text-sm text-muted-foreground">
          No leaderboard data yet.
        </p>
      ) : (
      <ul className="mt-3 flex flex-col gap-1">
        {players.map((player) => (
          <li
            key={player.id}
            className="flex items-center gap-3 rounded-xl px-2 py-2 even:bg-muted/40"
          >
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold shadow-sm ${positionColor(
                player.position
              )}`}
            >
              {player.position}
            </span>
            <Avatar size="sm">
              <AvatarFallback className="bg-emerald-100 text-xs font-semibold text-emerald-900">
                {player.initials}
              </AvatarFallback>
            </Avatar>
            <span className="flex-1 truncate text-sm font-medium text-foreground">
              {player.name}
            </span>
            <span className="text-sm font-semibold tabular-nums text-emerald-800">
              {player.score}
            </span>
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}
