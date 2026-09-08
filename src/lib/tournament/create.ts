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

export type UpdateDraftChampionshipDetailsInput = {
  championshipId: string;
  name: string;
  startDate?: Date;
  endDate?: Date;
};

/**
 * Updates a DRAFT championship's name/start/end date only. Rejects the
 * update entirely if the championship is no longer DRAFT — once a
 * championship has started, its dates/name are locked, exactly like
 * every other pre-start-only admin action in this module (see
 * enrollment.ts, course-setup.ts for the same DRAFT-only pattern).
 * Never touches status, rounds, or any other field.
 */
export async function updateDraftChampionshipDetails(
  input: UpdateDraftChampionshipDetailsInput
): Promise<void> {
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw new Error("End date must not be before start date.");
  }

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ status: championships.status })
      .from(championships)
      .where(eq(championships.id, input.championshipId))
      .limit(1);

    if (!existing) {
      throw new Error("Championship not found.");
    }
    if (existing.status !== "DRAFT") {
      throw new Error(
        "Only a DRAFT championship's details can be edited."
      );
    }

    await tx
      .update(championships)
      .set({
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
      })
      .where(eq(championships.id, input.championshipId));
  });
}
