import { Flag } from "lucide-react";

/**
 * Compact SCAR brand identity strip shown at the top of the Home page
 * main content. This is brand identity only — NOT another dashboard
 * card — so it stays short and does not duplicate the round/tee-time/
 * group details already shown prominently on the active championship
 * card below.
 *
 * No image asset is used here (see PR history: public/images only has
 * approved-design MOCKUP screenshots with baked-in text/UI, unsuitable
 * as real page artwork). All visible text is real HTML.
 */
export function GolfHeroBanner() {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-emerald-950 to-emerald-900 px-4 py-3 text-white sm:px-5 sm:py-3.5">
      <div className="min-w-0">
        <p className="text-[0.6rem] font-bold tracking-[0.2em] text-emerald-300 uppercase">
          Est. Championship Series
        </p>
        <p className="mt-0.5 truncate text-sm font-bold text-white sm:text-base">
          South Carolina Amateur Round
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <p
          className="hidden text-xs text-emerald-200/80 italic sm:block"
          style={{ fontFamily: "var(--font-scar-display)" }}
        >
          Golf. Friends. Competition.
        </p>
        <span className="flex size-8 items-center justify-center rounded-full bg-white/10 text-emerald-300">
          <Flag className="size-4" />
        </span>
      </div>
    </div>
  );
}
