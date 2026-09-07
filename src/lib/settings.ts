import "server-only";

import { db } from "@/db";
import { appSettings } from "@/db/schema/settings";
import { DEFAULT_MAX_HANDICAP } from "@/lib/handicap/calculate";

/**
 * Reads the configured maximum handicap, falling back to
 * `DEFAULT_MAX_HANDICAP` (18) if the singleton settings row hasn't been
 * created yet. There is no admin UI to edit this yet — see
 * src/db/schema/settings.ts.
 */
export async function getMaxHandicap(): Promise<number> {
  const [row] = await db.select().from(appSettings).limit(1);
  return row?.maxHandicap ?? DEFAULT_MAX_HANDICAP;
}
