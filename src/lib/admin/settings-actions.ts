"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { appSettings } from "@/db/schema/settings";
import { requireAdminMember } from "@/lib/current-member";

export type UpdateMaxHandicapResult =
  | { ok: true; maxHandicap: number }
  | { ok: false; error: string };

/**
 * ADMIN-only: updates the existing singleton `app_settings.maxHandicap`
 * row (upserting the row if it doesn't exist yet). Does not touch any
 * already-frozen `championship_players.frozenHandicap` values, and does
 * not change the handicap calculation engine itself — it already reads
 * this same setting via `getMaxHandicap()` (see src/lib/settings.ts).
 */
export async function updateMaxHandicapAction(
  maxHandicap: number
): Promise<UpdateMaxHandicapResult> {
  try {
    await requireAdminMember();

    if (!Number.isInteger(maxHandicap) || maxHandicap < 1 || maxHandicap > 54) {
      return { ok: false, error: "Enter a whole number between 1 and 54." };
    }

    await db
      .insert(appSettings)
      .values({ id: "singleton", maxHandicap })
      .onConflictDoUpdate({
        target: appSettings.id,
        set: { maxHandicap, updatedAt: new Date() },
      });

    revalidatePath("/admin/championship");
    return { ok: true, maxHandicap };
  } catch {
    return { ok: false, error: "Couldn't update the maximum handicap." };
  }
}
