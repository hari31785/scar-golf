import "server-only";

import { db } from "@/db";
import {
  championships,
  championshipRounds,
  type NewChampionship,
} from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";

export type CreateDraftChampionshipInput = {
  year: number;
  name: string;
  createdByMemberId?: string;
  startDate?: Date;
  endDate?: Date;
};

export type CreateDraftChampionshipResult = {
  championshipId: string;
};

/**
 * Creates a new DRAFT championship plus exactly 4 (empty, unscheduled)
 * championship_rounds rows. Does NOT freeze any handicaps and does NOT
 * enroll any players automatically — see src/lib/tournament/enrollment.ts
 * for adding players explicitly.
 *
 * Transaction-safe: the championship row and all 4 round rows are
 * created atomically — if anything fails, nothing is left half-created.
 *
 * Enforces "only one non-cancelled championship per year" at the
 * application level (in addition to the DB's plain unique index on
 * `year`, which would otherwise also block re-creating a championship
 * for a year whose only previous attempt was CANCELLED).
 */
export async function createDraftChampionship(
  input: CreateDraftChampionshipInput
): Promise<CreateDraftChampionshipResult> {
  return db.transaction(async (tx) => {
    const existingNonCancelled = await tx
      .select({ id: championships.id })
      .from(championships)
      .where(
        and(
          eq(championships.year, input.year),
          ne(championships.status, "CANCELLED")
        )
      )
      .limit(1);

    if (existingNonCancelled.length > 0) {
      throw new Error(
        `A non-cancelled championship already exists for year ${input.year}.`
      );
    }

    const newChampionship: NewChampionship = {
      year: input.year,
      name: input.name,
      status: "DRAFT",
      startDate: input.startDate,
      endDate: input.endDate,
      createdByMemberId: input.createdByMemberId,
    };

    const [inserted] = await tx
      .insert(championships)
      .values(newChampionship)
      .returning({ id: championships.id });

    // Exactly 4 rounds, always — SCAR championships are always 4 rounds
    // of 18 holes (see module doc comments across src/db/schema).
    await tx.insert(championshipRounds).values(
      [1, 2, 3, 4].map((roundNumber) => ({
        championshipId: inserted.id,
        roundNumber,
        status: "NOT_STARTED" as const,
      }))
    );

    return { championshipId: inserted.id };
  });
}
