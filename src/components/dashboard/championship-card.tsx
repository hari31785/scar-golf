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
  teeTime: string;
  groupNumber: number;
  course: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-900 via-emerald-950 to-black p-5 text-white shadow-lg shadow-emerald-950/20">
      <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-emerald-400/10 blur-2xl" />
      <div className="relative">
        <p className="text-[0.65rem] font-semibold tracking-[0.2em] text-emerald-300 uppercase">
          {course}
        </p>
        <h2 className="mt-1 text-lg font-semibold leading-snug">{name}</h2>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white/5 p-3">
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
          <div className="rounded-xl bg-white/5 p-3">
            <div className="flex items-center gap-1.5 text-emerald-300">
              <Clock className="size-3.5" />
              <span className="text-[0.65rem] font-medium uppercase tracking-wide">
                Tee Time
              </span>
            </div>
            <p className="mt-1 text-base font-semibold">{teeTime}</p>
          </div>
          <div className="rounded-xl bg-white/5 p-3">
            <div className="flex items-center gap-1.5 text-emerald-300">
              <Users className="size-3.5" />
              <span className="text-[0.65rem] font-medium uppercase tracking-wide">
                Group
              </span>
            </div>
            <p className="mt-1 text-base font-semibold">#{groupNumber}</p>
          </div>
        </div>

        <Button className="mt-4 h-11 w-full justify-between rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-emerald-950 hover:bg-emerald-300">
          Enter Scores
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
