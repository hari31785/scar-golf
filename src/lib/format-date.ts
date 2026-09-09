/**
 * Formats a date-ONLY value (e.g. a championship's `startDate`/`endDate`,
 * stored as a UTC-midnight instant representing a selected calendar day)
 * as a calendar date, WITHOUT letting the viewer's local timezone shift
 * the day.
 *
 * Why this exists: `new Date("YYYY-MM-DD")` parses as UTC midnight, and
 * `date.toLocaleDateString()` (no `timeZone` option) renders it in the
 * *local* timezone — for any UTC-negative timezone that silently moves
 * the displayed day back by one (e.g. 2026-09-10T00:00:00Z renders as
 * "Sep 9" in America/New_York). Forcing `timeZone: "UTC"` here makes the
 * displayed calendar date always match the originally selected date,
 * regardless of browser/server/Vercel/DB timezone.
 *
 * Only use this for genuine date-only values (championship start/end
 * dates). Do NOT use this for real timestamps (createdAt/updatedAt,
 * score submission times, playoff/audit timestamps, etc.) — those are
 * moments in time and should keep rendering in the viewer's local zone.
 */
export function formatCalendarDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Formats a round-group tee time as a clock time in the SCAR
 * championship's actual local timezone (America/New_York), regardless
 * of where this code executes.
 *
 * Why this exists: tee times are a real-world clock time at the course
 * ("8:12 AM"), not a viewer-relative moment. `toLocaleTimeString(undefined, ...)`
 * (no `timeZone`) renders in whatever timezone the CODE is running in —
 * which is the visitor's browser for client components, but is the
 * SERVER's timezone (UTC on Vercel) for server components. That
 * mismatch was producing a several-hour-off display (e.g. "6:20 PM"
 * instead of "2:20 PM") on server-rendered pages like Home and Score,
 * while the client-rendered Pairings page happened to look correct only
 * for viewers already in US Eastern time. Forcing `timeZone:
 * "America/New_York"` here makes every page show the same, correct,
 * course-local tee time for every viewer everywhere.
 */
export function formatTeeTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

