import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { championshipRounds } from "@/db/schema/championship-rounds";
import {
  getRoundHoles,
  validateCourseSetup,
  validateHoleSetup,
  type CourseSetupInput,
  type HoleSetupInput,
} from "@/lib/tournament/course-setup";

export type RoundSetupStatus = "not-configured" | "incomplete" | "ready";

export type RoundSetupSummary = {
  championshipRoundId: string;
  roundNumber: number;
  courseSetup: CourseSetupInput | null;
  holes: HoleSetupInput[];
  status: RoundSetupStatus;
};

/**
 * Read-only composition for the round-setup admin UI: for each of a
 * championship's rounds, its saved course/tee snapshot (if any), its
 * saved hole layout, and a simple status derived by reusing the
 * existing pure `validateCourseSetup`/`validateHoleSetup` rules — no
 * new business-rule engine here.
 */
export async function listRoundSetupSummaries(
  championshipId: string
): Promise<RoundSetupSummary[]> {
  const rounds = await db
    .select()
    .from(championshipRounds)
    .where(eq(championshipRounds.championshipId, championshipId))
    .orderBy(asc(championshipRounds.roundNumber));

  const summaries: RoundSetupSummary[] = [];
  for (const round of rounds) {
    const holes = await getRoundHoles(round.id);

    const hasAnyCourseField =
      round.courseName !== null ||
      round.teeName !== null ||
      round.teeColor !== null ||
      round.courseRating !== null ||
      round.slope !== null ||
      round.par !== null ||
      round.yardage !== null;

    if (!hasAnyCourseField && holes.length === 0) {
      summaries.push({
        championshipRoundId: round.id,
        roundNumber: round.roundNumber,
        courseSetup: null,
        holes: [],
        status: "not-configured",
      });
      continue;
    }

    const courseSetup: CourseSetupInput | null =
      round.courseName !== null &&
      round.teeName !== null &&
      round.teeColor !== null &&
      round.courseRating !== null &&
      round.slope !== null &&
      round.par !== null &&
      round.yardage !== null
        ? {
            courseName: round.courseName,
            city: round.courseCity,
            teeName: round.teeName,
            teeColor: round.teeColor,
            courseRating: round.courseRating,
            slope: round.slope,
            totalPar: round.par,
            yardage: round.yardage,
          }
        : null;

    const courseProblems = courseSetup ? validateCourseSetup(courseSetup) : ["incomplete"];
    const holeProblems =
      courseSetup && holes.length > 0 ? validateHoleSetup(holes, courseSetup.totalPar) : ["incomplete"];

    const status: RoundSetupStatus =
      courseProblems.length === 0 && holeProblems.length === 0 ? "ready" : "incomplete";

    summaries.push({
      championshipRoundId: round.id,
      roundNumber: round.roundNumber,
      courseSetup,
      holes,
      status,
    });
  }

  return summaries;
}
