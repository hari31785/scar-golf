import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db, type DbTransaction } from "@/db";
import {
  championships,
  championshipRounds,
  championshipPlayers,
  members,
  playoffSessions,
  playoffParticipants,
  playoffHoles,
  playoffHoleScores,
} from "@/db/schema";
import { isValidGrossScore } from "./scoring/completeness";

export class PlayoffError extends Error {}

/**
 * Whether this championship currently needs (or already has) a playoff:
 * Round 4 COMPLETE, championship still ACTIVE, and no champion yet.
 * This is exactly the "awaiting playoff" state `finalizeChampionship`
 * deliberately leaves behind when first place is tied (see
 * src/lib/tournament/finalize.ts doc comment) — recomputed here by
 * reading persisted state only, never by re-running finalization logic.
 */
export async function championshipNeedsPlayoff(
  championshipId: string
): Promise<boolean> {
  const [championship] = await db
    .select({ status: championships.status, championMemberId: championships.championMemberId })
    .from(championships)
    .where(eq(championships.id, championshipId))
    .limit(1);
  if (!championship) return false;
  if (championship.status !== "ACTIVE" || championship.championMemberId !== null) {
    return false;
  }

  const round4 = await db
    .select({ status: championshipRounds.status })
    .from(championshipRounds)
    .where(
      and(
        eq(championshipRounds.championshipId, championshipId),
        eq(championshipRounds.roundNumber, 4)
      )
    )
    .limit(1);

  return round4.length > 0 && round4[0].status === "COMPLETE";
}

export type TiedPlayerRow = {
  championshipPlayerId: string;
  memberId: string;
  displayName: string;
};

/**
 * The ACTIVE participants tied at `finalPosition = 1` for this
 * championship — the only players an admin may select into a playoff
 * session. Read-only.
 */
export async function listTiedFirstPlacePlayers(
  championshipId: string
): Promise<TiedPlayerRow[]> {
  const rows = await db
    .select({
      championshipPlayerId: championshipPlayers.id,
      memberId: championshipPlayers.memberId,
      displayName: members.displayName,
    })
    .from(championshipPlayers)
    .innerJoin(members, eq(members.id, championshipPlayers.memberId))
    .where(
      and(
        eq(championshipPlayers.championshipId, championshipId),
        eq(championshipPlayers.finalPosition, 1),
        eq(championshipPlayers.participantStatus, "ACTIVE")
      )
    );
  return rows;
}

export type PlayoffHoleScoreRow = {
  championshipPlayerId: string;
  grossScore: number;
};

export type PlayoffHoleRow = {
  playoffHoleId: string;
  sequenceNumber: number;
  scores: PlayoffHoleScoreRow[];
};

export type PlayoffSessionState =
  | { state: "none" }
  | {
      state: "in-progress" | "resolved";
      playoffSessionId: string;
      participants: TiedPlayerRow[];
      holes: PlayoffHoleRow[];
      winnerChampionshipPlayerId: string | null;
    };

/**
 * Read-only composition of the current playoff session (if any) for a
 * championship: its participants and every recorded hole's scores, in
 * sequence order.
 */
export async function getPlayoffSessionState(
  championshipId: string
): Promise<PlayoffSessionState> {
  const [session] = await db
    .select()
    .from(playoffSessions)
    .where(eq(playoffSessions.championshipId, championshipId))
    .limit(1);

  if (!session) return { state: "none" };

  const participantRows = await db
    .select({
      championshipPlayerId: championshipPlayers.id,
      memberId: championshipPlayers.memberId,
      displayName: members.displayName,
    })
    .from(playoffParticipants)
    .innerJoin(
      championshipPlayers,
      eq(championshipPlayers.id, playoffParticipants.championshipPlayerId)
    )
    .innerJoin(members, eq(members.id, championshipPlayers.memberId))
    .where(eq(playoffParticipants.playoffSessionId, session.id));

  const holeRows = await db
    .select({ id: playoffHoles.id, sequenceNumber: playoffHoles.sequenceNumber })
    .from(playoffHoles)
    .where(eq(playoffHoles.playoffSessionId, session.id))
    .orderBy(asc(playoffHoles.sequenceNumber));

  const holes: PlayoffHoleRow[] = [];
  for (const hole of holeRows) {
    const scores = await db
      .select({
        championshipPlayerId: playoffHoleScores.championshipPlayerId,
        grossScore: playoffHoleScores.grossScore,
      })
      .from(playoffHoleScores)
      .where(eq(playoffHoleScores.playoffHoleId, hole.id));
    holes.push({ playoffHoleId: hole.id, sequenceNumber: hole.sequenceNumber, scores });
  }

  return {
    state: session.status === "RESOLVED" ? "resolved" : "in-progress",
    playoffSessionId: session.id,
    participants: participantRows,
    holes,
    winnerChampionshipPlayerId: session.winnerChampionshipPlayerId,
  };
}

/**
 * ADMIN-only: creates the playoff session for a championship, recording
 * exactly the admin-selected tied players as eligible participants.
 *
 * Enforces:
 *  - championship needs a playoff (Round 4 COMPLETE, ACTIVE, no champion),
 *  - no playoff session already exists for this championship,
 *  - every selected player is currently tied at finalPosition = 1 (ACTIVE),
 *  - at least 2 players selected (a playoff with fewer makes no sense).
 */
export async function createPlayoffSession(params: {
  championshipId: string;
  championshipPlayerIds: string[];
  createdByMemberId: string;
}): Promise<{ playoffSessionId: string }> {
  const { championshipId, championshipPlayerIds, createdByMemberId } = params;

  return db.transaction(async (tx) => {
    const needsPlayoff = await championshipNeedsPlayoffTx(tx, championshipId);
    if (!needsPlayoff) {
      throw new PlayoffError(
        "This championship is not eligible for a playoff right now."
      );
    }

    const [existing] = await tx
      .select({ id: playoffSessions.id })
      .from(playoffSessions)
      .where(eq(playoffSessions.championshipId, championshipId))
      .limit(1);
    if (existing) {
      throw new PlayoffError("A playoff session already exists for this championship.");
    }

    const uniqueIds = Array.from(new Set(championshipPlayerIds));
    if (uniqueIds.length < 2) {
      throw new PlayoffError("Select at least two tied players for the playoff.");
    }

    const tiedRows = await tx
      .select({ id: championshipPlayers.id })
      .from(championshipPlayers)
      .where(
        and(
          eq(championshipPlayers.championshipId, championshipId),
          eq(championshipPlayers.finalPosition, 1),
          eq(championshipPlayers.participantStatus, "ACTIVE")
        )
      );
    const tiedIdSet = new Set(tiedRows.map((r) => r.id));
    for (const id of uniqueIds) {
      if (!tiedIdSet.has(id)) {
        throw new PlayoffError(
          "Only players tied for first place may be selected for the playoff."
        );
      }
    }

    const [session] = await tx
      .insert(playoffSessions)
      .values({ championshipId, createdByMemberId })
      .returning({ id: playoffSessions.id });

    await tx.insert(playoffParticipants).values(
      uniqueIds.map((championshipPlayerId) => ({
        playoffSessionId: session.id,
        championshipPlayerId,
      }))
    );

    return { playoffSessionId: session.id };
  });
}

async function championshipNeedsPlayoffTx(
  tx: DbTransaction,
  championshipId: string
): Promise<boolean> {
  const [championship] = await tx
    .select({ status: championships.status, championMemberId: championships.championMemberId })
    .from(championships)
    .where(eq(championships.id, championshipId))
    .limit(1);
  if (!championship) return false;
  if (championship.status !== "ACTIVE" || championship.championMemberId !== null) {
    return false;
  }

  const round4 = await tx
    .select({ status: championshipRounds.status })
    .from(championshipRounds)
    .where(
      and(
        eq(championshipRounds.championshipId, championshipId),
        eq(championshipRounds.roundNumber, 4)
      )
    )
    .limit(1);

  return round4.length > 0 && round4[0].status === "COMPLETE";
}

export type RecordPlayoffHoleResult = {
  playoffHoleId: string;
  sequenceNumber: number;
  outcome: "tied" | "winner";
  winnerChampionshipPlayerId: string | null;
};

/**
 * ADMIN-only: records one sudden-death playoff hole's scores for every
 * participant, in a single transaction. If exactly one participant has
 * the unique lowest score, the session is marked RESOLVED and — in the
 * SAME transaction — the championship's `championMemberId` is set and
 * its status transitions to COMPLETED. Never touches frozen handicaps,
 * `hole_scores`, `scorecard_submissions`, or `finalPosition` (already
 * persisted by `finalizeChampionship`).
 *
 * Enforces:
 *  - the session exists and is still IN_PROGRESS,
 *  - the championship is still eligible (ACTIVE, no champion — a
 *    defensive re-check even though session status should already
 *    guarantee this),
 *  - exactly one score is provided per participant, all positive valid
 *    integers,
 *  - hole sequence numbers are assigned atomically (next after the
 *    highest existing one for this session).
 */
export async function recordPlayoffHole(params: {
  playoffSessionId: string;
  scores: PlayoffHoleScoreRow[];
}): Promise<RecordPlayoffHoleResult> {
  const { playoffSessionId, scores } = params;

  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(playoffSessions)
      .where(eq(playoffSessions.id, playoffSessionId))
      .limit(1);
    if (!session) {
      throw new PlayoffError("Playoff session not found.");
    }
    if (session.status !== "IN_PROGRESS") {
      throw new PlayoffError("This playoff has already been resolved.");
    }

    const [championship] = await tx
      .select({ status: championships.status, championMemberId: championships.championMemberId })
      .from(championships)
      .where(eq(championships.id, session.championshipId))
      .limit(1);
    if (
      !championship ||
      championship.status !== "ACTIVE" ||
      championship.championMemberId !== null
    ) {
      throw new PlayoffError("This championship is no longer eligible for a playoff.");
    }

    const participantRows = await tx
      .select({ championshipPlayerId: playoffParticipants.championshipPlayerId })
      .from(playoffParticipants)
      .where(eq(playoffParticipants.playoffSessionId, playoffSessionId));
    const participantIds = new Set(participantRows.map((r) => r.championshipPlayerId));

    if (scores.length !== participantIds.size) {
      throw new PlayoffError(
        "A score is required for every playoff participant, and only for them."
      );
    }
    const seenIds = new Set<string>();
    for (const score of scores) {
      if (!participantIds.has(score.championshipPlayerId)) {
        throw new PlayoffError("Score submitted for a non-participant.");
      }
      if (seenIds.has(score.championshipPlayerId)) {
        throw new PlayoffError("Duplicate score submitted for the same player.");
      }
      seenIds.add(score.championshipPlayerId);
      if (!isValidGrossScore(score.grossScore)) {
        throw new PlayoffError(`Invalid score ${score.grossScore}.`);
      }
    }

    const existingHoles = await tx
      .select({ sequenceNumber: playoffHoles.sequenceNumber })
      .from(playoffHoles)
      .where(eq(playoffHoles.playoffSessionId, playoffSessionId));
    const nextSequenceNumber =
      existingHoles.length === 0
        ? 1
        : Math.max(...existingHoles.map((h) => h.sequenceNumber)) + 1;

    const [hole] = await tx
      .insert(playoffHoles)
      .values({ playoffSessionId, sequenceNumber: nextSequenceNumber })
      .returning({ id: playoffHoles.id });

    await tx.insert(playoffHoleScores).values(
      scores.map((s) => ({
        playoffHoleId: hole.id,
        championshipPlayerId: s.championshipPlayerId,
        grossScore: s.grossScore,
      }))
    );

    const lowestScore = Math.min(...scores.map((s) => s.grossScore));
    const lowestScorers = scores.filter((s) => s.grossScore === lowestScore);

    if (lowestScorers.length !== 1) {
      // Tied lowest — playoff continues to another hole.
      return {
        playoffHoleId: hole.id,
        sequenceNumber: nextSequenceNumber,
        outcome: "tied",
        winnerChampionshipPlayerId: null,
      };
    }

    const winnerChampionshipPlayerId = lowestScorers[0].championshipPlayerId;
    const [winnerPlayer] = await tx
      .select({ memberId: championshipPlayers.memberId })
      .from(championshipPlayers)
      .where(eq(championshipPlayers.id, winnerChampionshipPlayerId))
      .limit(1);
    if (!winnerPlayer) {
      throw new PlayoffError("Winning player record not found.");
    }

    await tx
      .update(playoffSessions)
      .set({
        status: "RESOLVED",
        winnerChampionshipPlayerId,
        updatedAt: new Date(),
      })
      .where(eq(playoffSessions.id, playoffSessionId));

    // Preserve the 72-hole finalPosition data — never touched here.
    // Never touch frozen handicaps or 4-round gross/net totals.
    await tx
      .update(championships)
      .set({
        championMemberId: winnerPlayer.memberId,
        status: "COMPLETED",
        updatedAt: new Date(),
      })
      .where(eq(championships.id, session.championshipId));

    return {
      playoffHoleId: hole.id,
      sequenceNumber: nextSequenceNumber,
      outcome: "winner",
      winnerChampionshipPlayerId,
    };
  });
}
