/**
 * Script-safe (no "server-only") version of getMaxHandicap for use by
 * standalone Node/tsx scripts (e.g. scripts/import-history.ts). Mirrors
 * src/lib/settings.ts but uses scriptDb instead of @/db, since the
 * latter's "server-only" import throws outside the Next.js runtime.
 */
import { scriptDb } from "@/db/script-client";
import { appSettings } from "@/db/schema/settings";
import { DEFAULT_MAX_HANDICAP } from "@/lib/handicap/calculate";

export async function getMaxHandicapForScript(): Promise<number> {
  const rows = await scriptDb
    .select({ maxHandicap: appSettings.maxHandicap })
    .from(appSettings)
    .limit(1);
  return rows[0]?.maxHandicap ?? DEFAULT_MAX_HANDICAP;
}
