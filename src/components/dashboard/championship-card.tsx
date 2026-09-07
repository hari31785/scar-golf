import { Button } from "@/components/ui/button";
import { Flag, Clock, Users, ChevronRight } from "lucide-react";

export function ChampionshipCard({
  name,
  round,
  totalRounds,
  teeTime,
  groupNumber,
  course,
}: {
  name: string;
  round: number;
  totalRounds: number;
  /** Already-formatted display string (e.g. "8:12 AM" or "—"). */
  teeTime: string;
  /** Null when pairings haven't been generated yet. */
  groupNumber: number | null;
  course: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-900 via-emerald-950 to-emerald-950 p-5 text-white shadow-lg shadow-emerald-950/20">
      <div className="relative">
        <div className="flex items-center justify-between">
          <p className="text-[0.65rem] font-semibold tracking-[0.2em] text-emerald-300 uppercase">
            {course}
          </p>
          <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[0.65rem] font-semibold tracking-wide text-emerald-200 uppercase">
            Live
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
          </span>
        </div>
        <h2
          className="mt-1.5 text-2xl leading-snug font-bold"
          style={{ fontFamily: "var(--font-scar-display)" }}
        >
          {name}
        </h2>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-black/20 p-3">
            <div className="flex items-center gap-1.5 text-emerald-300">
              <Flag className="size-3.5" />
              <span className="text-[0.65rem] font-medium uppercase tracking-wide">
                Round
              </span>
            </div>
            <p className="mt-1 text-base font-semibold">
              {round}
              <span className="text-xs font-normal text-white/60">
                /{totalRounds}
              </span>
            </p>
          </div>
          <div className="rounded-xl bg-black/20 p-3">
            <div className="flex items-center gap-1.5 text-emerald-300">
              <Clock className="size-3.5" />
              <span className="text-[0.65rem] font-medium uppercase tracking-wide">
                Tee Time
              </span>
            </div>
            <p className="mt-1 text-base font-semibold">{teeTime}</p>
          </div>
          <div className="rounded-xl bg-black/20 p-3">
            <div className="flex items-center gap-1.5 text-emerald-300">
              <Users className="size-3.5" />
              <span className="text-[0.65rem] font-medium uppercase tracking-wide">
                Group
              </span>
            </div>
            <p className="mt-1 text-base font-semibold">
              {groupNumber !== null ? `#${groupNumber}` : "—"}
            </p>
          </div>
        </div>

        <Button
          render={<a href="/score" />}
          className="mt-4 h-12 w-full justify-between rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-md hover:bg-emerald-500"
        >
          Enter Scores
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
