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
