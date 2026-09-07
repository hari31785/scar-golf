import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  championships,
  championshipRounds,
  championshipRoundHoles,
  members,
} from "@/db/schema";

export class CourseSetupError extends Error {}

/** Round-level course/tee metadata as configured by an admin. */
export type CourseSetupInput = {
  courseName: string;
  city?: string | null;
  teeName: string;
  teeColor: string;
  courseRating: number;
  slope: number;
  totalPar: number;
  yardage: number;
};

/** One hole's par + stroke index, as configured by an admin. */
export type HoleSetupInput = {
  holeNumber: number;
  par: number;
  strokeIndex: number;
};

const MIN_COURSE_RATING = 50;
const MAX_COURSE_RATING = 90;
const MIN_SLOPE = 55;
const MAX_SLOPE = 155;
const MIN_TOTAL_PAR = 60;
const MAX_TOTAL_PAR = 80;
const MIN_YARDAGE = 3000;
const MAX_YARDAGE = 8000;
const MIN_HOLE_PAR = 3;
const MAX_HOLE_PAR = 6;

/**
 * Validates round-level course/tee metadata. Pure — no DB access.
 * Returns a list of human-readable problems; empty means valid.
 */
export function validateCourseSetup(input: CourseSetupInput): string[] {
  const problems: string[] = [];

  if (!input.courseName || !input.courseName.trim()) {
    problems.push("Course name is required.");
  }
  if (!input.teeName || !input.teeName.trim()) {
    problems.push("Tee name is required.");
  }
  if (!input.teeColor || !input.teeColor.trim()) {
    problems.push("Tee color is required.");
  }
  if (
    !Number.isFinite(input.courseRating) ||
    input.courseRating < MIN_COURSE_RATING ||
    input.courseRating > MAX_COURSE_RATING
  ) {
    problems.push(
      `Course rating must be between ${MIN_COURSE_RATING} and ${MAX_COURSE_RATING}.`
    );
  }
  if (
    !Number.isInteger(input.slope) ||
    input.slope < MIN_SLOPE ||
    input.slope > MAX_SLOPE
  ) {
    problems.push(`Slope must be an integer between ${MIN_SLOPE} and ${MAX_SLOPE}.`);
  }
  if (
    !Number.isInteger(input.totalPar) ||
    input.totalPar < MIN_TOTAL_PAR ||
    input.totalPar > MAX_TOTAL_PAR
  ) {
    problems.push(
      `Total par must be an integer between ${MIN_TOTAL_PAR} and ${MAX_TOTAL_PAR}.`
    );
  }
  if (
    !Number.isInteger(input.yardage) ||
    input.yardage < MIN_YARDAGE ||
    input.yardage > MAX_YARDAGE
  ) {
    problems.push(
      `Yardage must be an integer between ${MIN_YARDAGE} and ${MAX_YARDAGE}.`
    );
  }

  return problems;
}

/**
 * Validates a full 18-hole layout against a round's totalPar. Pure — no
 * DB access.
 *   - exactly 18 holes
 *   - hole numbers are exactly {1..18}, each once
 *   - stroke indexes are exactly {1..18}, each once
 *   - each hole's par is a sane individual value (3-6)
 *   - the sum of all 18 hole pars equals the round's totalPar
 */
export function validateHoleSetup(
  holes: HoleSetupInput[],
  totalPar: number
): string[] {
  const problems: string[] = [];

  if (holes.length !== 18) {
    problems.push(`Expected exactly 18 holes, got ${holes.length}.`);
    return problems;
  }

  const holeNumbers = new Set<number>();
  const strokeIndexes = new Set<number>();
  let parSum = 0;

  for (const hole of holes) {
    if (!Number.isInteger(hole.par) || hole.par < MIN_HOLE_PAR || hole.par > MAX_HOLE_PAR) {
      problems.push(
        `Hole ${hole.holeNumber}: par must be an integer between ${MIN_HOLE_PAR} and ${MAX_HOLE_PAR}.`
      );
    }
    holeNumbers.add(hole.holeNumber);
    strokeIndexes.add(hole.strokeIndex);
    parSum += hole.par;
  }

  for (let n = 1; n <= 18; n++) {
    if (!holeNumbers.has(n)) {
      problems.push(`Missing hole number ${n}.`);
    }
  }
  for (let n = 1; n <= 18; n++) {
    if (!strokeIndexes.has(n)) {
      problems.push(`Stroke index ${n} is missing — stroke indexes must be 1-18, each used exactly once.`);
    }
  }
  if (holeNumbers.size !== 18) {
    problems.push("Hole numbers must each be used exactly once.");
  }
  if (strokeIndexes.size !== 18) {
    problems.push("Stroke indexes must each be used exactly once.");
  }
  if (parSum !== totalPar) {
    problems.push(
      `Hole pars sum to ${parSum}, which does not match the round's total par of ${totalPar}.`
    );
  }

  return problems;
}

async function assertChampionshipIsDraft(championshipRoundId: string) {
  const [round] = await db
    .select({
      championshipId: championshipRounds.championshipId,
    })
    .from(championshipRounds)
    .where(eq(championshipRounds.id, championshipRoundId))
    .limit(1);
  if (!round) {
    throw new Error(`Championship round ${championshipRoundId} does not exist.`);
  }

  const [championship] = await db
    .select({ status: championships.status })
    .from(championships)
    .where(eq(championships.id, round.championshipId))
    .limit(1);
  if (!championship) {
    throw new Error(`Championship ${round.championshipId} does not exist.`);
  }
  if (championship.status !== "DRAFT") {
    throw new CourseSetupError(
      "Course/tee and hole setup can only be changed while the championship is DRAFT — it is frozen once the championship becomes ACTIVE."
    );
  }
}

/**
 * Sets/updates a round's round-level course/tee metadata. ADMIN-only
 * (enforced by the caller — this function does not itself check
 * appRole). Only permitted while the parent championship is DRAFT.
 */
export async function setRoundCourseSetup(params: {
  championshipRoundId: string;
  courseSetup: CourseSetupInput;
}): Promise<void> {
  const { championshipRoundId, courseSetup } = params;

  const problems = validateCourseSetup(courseSetup);
  if (problems.length > 0) {
    throw new CourseSetupError(problems.join(" "));
  }

  await assertChampionshipIsDraft(championshipRoundId);

  await db
    .update(championshipRounds)
    .set({
      courseName: courseSetup.courseName.trim(),
      courseCity: courseSetup.city?.trim() || null,
      teeName: courseSetup.teeName.trim(),
      teeColor: courseSetup.teeColor.trim(),
      courseRating: courseSetup.courseRating,
      slope: courseSetup.slope,
      par: courseSetup.totalPar,
      yardage: courseSetup.yardage,
      updatedAt: new Date(),
    })
    .where(eq(championshipRounds.id, championshipRoundId));
}

/**
 * Replaces a round's 18-hole layout (par + stroke index per hole).
 * ADMIN-only (enforced by the caller). Only permitted while the parent
 * championship is DRAFT. The round's current `par` (totalPar) is used
 * to validate the hole pars sum correctly — set course setup first.
 */
export async function setRoundHoles(params: {
  championshipRoundId: string;
  holes: HoleSetupInput[];
}): Promise<void> {
  const { championshipRoundId, holes } = params;

  await assertChampionshipIsDraft(championshipRoundId);

  const [round] = await db
    .select({ par: championshipRounds.par })
    .from(championshipRounds)
    .where(eq(championshipRounds.id, championshipRoundId))
    .limit(1);
  if (!round) {
    throw new Error(`Championship round ${championshipRoundId} does not exist.`);
  }
  if (round.par === null) {
    throw new CourseSetupError(
      "Set the round's total par (via setRoundCourseSetup) before configuring holes."
    );
  }

  const problems = validateHoleSetup(holes, round.par);
  if (problems.length > 0) {
    throw new CourseSetupError(problems.join(" "));
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(championshipRoundHoles)
      .where(eq(championshipRoundHoles.championshipRoundId, championshipRoundId));

    await tx.insert(championshipRoundHoles).values(
      holes.map((hole) => ({
        championshipRoundId,
        holeNumber: hole.holeNumber,
        par: hole.par,
        strokeIndex: hole.strokeIndex,
      }))
    );
  });
}

/** Reads a round's current hole layout, ordered by hole number. */
export async function getRoundHoles(championshipRoundId: string) {
  return db
    .select({
      holeNumber: championshipRoundHoles.holeNumber,
      par: championshipRoundHoles.par,
      strokeIndex: championshipRoundHoles.strokeIndex,
    })
    .from(championshipRoundHoles)
    .where(eq(championshipRoundHoles.championshipRoundId, championshipRoundId))
    .orderBy(asc(championshipRoundHoles.holeNumber));
}

/**
 * Validates that a single round has complete, valid course/tee data AND
 * a complete, valid 18-hole layout. Used by the championship start
 * service (src/lib/tournament/start.ts) to require this for all 4
 * rounds before a championship may become ACTIVE.
 */
export async function validateRoundIsReadyToStart(
  championshipRoundId: string
): Promise<string[]> {
  const [round] = await db
    .select()
    .from(championshipRounds)
    .where(eq(championshipRounds.id, championshipRoundId))
    .limit(1);
  if (!round) {
    throw new Error(`Championship round ${championshipRoundId} does not exist.`);
  }

  const problems: string[] = [];

  if (
    round.courseName === null ||
    round.teeName === null ||
    round.teeColor === null ||
    round.courseRating === null ||
    round.slope === null ||
    round.par === null ||
    round.yardage === null
  ) {
    problems.push(
      `Round ${round.roundNumber}: course/tee setup is incomplete.`
    );
  } else {
    problems.push(
      ...validateCourseSetup({
        courseName: round.courseName,
        city: round.courseCity,
        teeName: round.teeName,
        teeColor: round.teeColor,
        courseRating: round.courseRating,
        slope: round.slope,
        totalPar: round.par,
        yardage: round.yardage,
      }).map((p) => `Round ${round.roundNumber}: ${p}`)
    );
  }

  if (round.par !== null) {
    const holes = await getRoundHoles(championshipRoundId);
    problems.push(
      ...validateHoleSetup(holes, round.par).map((p) => `Round ${round.roundNumber}: ${p}`)
    );
  } else {
    problems.push(`Round ${round.roundNumber}: cannot validate holes without a total par set.`);
  }

  return problems;
}

/**
 * Atomically sets a round's course/tee metadata AND its full 18-hole
 * layout together, in ONE database transaction.
 *
 * This exists because the UI's "Save Round Setup" action previously
 * called `setRoundCourseSetup` and `setRoundHoles` as two separate
 * operations — if the first succeeded and the second then failed
 * (e.g. invalid holes), the round-level fields would remain saved
 * while the hole layout stayed stale/partial. Using this instead
 * guarantees both writes succeed together or neither is applied.
 *
 * Enforces, in order, before any write occurs:
 *  - the acting member exists, is an ACTIVE member, and has the ADMIN
 *    app role (defense in depth — the caller/server action should
 *    already have checked this, but this service re-checks
 *    independently, matching the pattern used by
 *    src/lib/tournament/scoring/submit-group.ts),
 *  - the championship round exists and its parent championship is
 *    DRAFT (via the existing `assertChampionshipIsDraft`),
 *  - the course/tee metadata is valid (`validateCourseSetup`),
 *  - the full 18-hole layout is valid against the given totalPar
 *    (`validateHoleSetup`) — no duplicated validation rules, both are
 *    the same pure helpers used by `setRoundCourseSetup`/`setRoundHoles`.
 *
 * Only once all of the above pass does the transaction perform the
 * round-level update and replace the round's holes. Any failure
 * (validation or a DB error partway through) rolls back everything —
 * the previously saved round setup is left completely unchanged.
 */
export async function setCompleteRoundSetup(params: {
  championshipRoundId: string;
  actingMemberId: string;
  courseSetup: CourseSetupInput;
  holes: HoleSetupInput[];
}): Promise<void> {
  const { championshipRoundId, actingMemberId, courseSetup, holes } = params;

  const courseProblems = validateCourseSetup(courseSetup);
  const holeProblems = validateHoleSetup(holes, courseSetup.totalPar);
  const problems = [...courseProblems, ...holeProblems];
  if (problems.length > 0) {
    throw new CourseSetupError(problems.join(" "));
  }

  await db.transaction(async (tx) => {
    const [actingMember] = await tx
      .select({ status: members.status, appRole: members.appRole })
      .from(members)
      .where(eq(members.id, actingMemberId))
      .limit(1);
    if (!actingMember) {
      throw new CourseSetupError(`Member ${actingMemberId} does not exist.`);
    }
    if (actingMember.status !== "ACTIVE" || actingMember.appRole !== "ADMIN") {
      throw new CourseSetupError(
        "Only an ACTIVE ADMIN member may configure round setup."
      );
    }

    const [round] = await tx
      .select({ championshipId: championshipRounds.championshipId })
      .from(championshipRounds)
      .where(eq(championshipRounds.id, championshipRoundId))
      .limit(1);
    if (!round) {
      throw new Error(`Championship round ${championshipRoundId} does not exist.`);
    }

    const [championship] = await tx
      .select({ status: championships.status })
      .from(championships)
      .where(eq(championships.id, round.championshipId))
      .limit(1);
    if (!championship) {
      throw new Error(`Championship ${round.championshipId} does not exist.`);
    }
    if (championship.status !== "DRAFT") {
      throw new CourseSetupError(
        "Course/tee and hole setup can only be changed while the championship is DRAFT — it is frozen once the championship becomes ACTIVE."
      );
    }

    await tx
      .update(championshipRounds)
      .set({
        courseName: courseSetup.courseName.trim(),
        courseCity: courseSetup.city?.trim() || null,
        teeName: courseSetup.teeName.trim(),
        teeColor: courseSetup.teeColor.trim(),
        courseRating: courseSetup.courseRating,
        slope: courseSetup.slope,
        par: courseSetup.totalPar,
        yardage: courseSetup.yardage,
        updatedAt: new Date(),
      })
      .where(eq(championshipRounds.id, championshipRoundId));

    await tx
      .delete(championshipRoundHoles)
      .where(eq(championshipRoundHoles.championshipRoundId, championshipRoundId));

    await tx.insert(championshipRoundHoles).values(
      holes.map((hole) => ({
        championshipRoundId,
        holeNumber: hole.holeNumber,
        par: hole.par,
        strokeIndex: hole.strokeIndex,
      }))
    );
  });
}
