import "server-only";

import { eq } from "drizzle-orm";
import { db, type DbTransaction } from "@/db";
import {
  championshipPlayers,
  championshipRounds,
  pairingGenerations,
  roundGroupPlayers,
  roundGroups,
} from "@/db/schema";
import { computeGroupSizes, type PairingGroup } from "./pairing";

export class Round1PairingError extends Error {}

type ActivePlayer = {
  championshipPlayerId: string;
  membershipTypeSnapshot: "PERMANENT" | "ASSOCIATE" | null;
};

const FIRST_GROUP_TARGET_SIZE = 4;

/**
 * Deterministic string hash (FNV-1a), used purely to derive a
 * reproducible pseudo-random sort key per (namespace + roundId + player)
 * tuple — NOT for any cryptographic purpose. Different `namespace`
 * values are used for different randomization "roles" (selecting which
 * associates fill the founders' group vs. shuffling that group vs.
 * shuffling everyone else) precisely so those three decisions don't
 * accidentally correlate with each other for the same round.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic "shuffle": sort by a namespaced hash of each item's id. */
function deterministicShuffle(
  ids: string[],
  namespace: string,
  championshipRoundId: string
): string[] {
  return [...ids].sort(
    (a, b) =>
      fnv1a(`${namespace}:${championshipRoundId}:${a}`) -
      fnv1a(`${namespace}:${championshipRoundId}:${b}`)
  );
}

/**
 * Builds Round 1's groups per the "founders" rule:
 *
 * PERMANENT members are treated as the club's founders and always
 * anchor the first group:
 *   - If >= 4 founders are ACTIVE, the first 4 (chosen deterministically
 *     by championshipPlayerId — see note below) make up the first
 *     group; no associates are needed to fill it.
 *   - If fewer than 4 founders are ACTIVE, the first group starts with
 *     all of them, then is filled up to 4 (as far as the ACTIVE
 *     associate pool allows) by randomly selected associates.
 *   - If there are zero founders, there is no special first group at
 *     all — everyone is shuffled together and split using the normal
 *     balanced group-size logic.
 *   - If fewer than 4 total ACTIVE participants exist, the algorithm
 *     above naturally collapses to a single group containing everyone.
 *
 * All remaining (non-first-group) participants are shuffled and then
 * split into balanced groups of 3-4 using the existing
 * `computeGroupSizes` logic, so we never end up with an avoidable
 * leftover like 4+1 when 3+2 is possible.
 *
 * DETERMINISM: every random-seeming decision is actually a deterministic
 * sort keyed on a namespaced hash of (championshipRoundId + player id),
 * using three DISTINCT namespaces so they never correlate:
 *   - "select-associates-for-first-group" — which associates fill the
 *     founders' group,
 *   - "shuffle-first-group" — the internal order of the first group,
 *   - "shuffle-remaining" — the order of everyone else before chunking.
 * The same round always produces the same groups; no `Math.random()`.
 *
 * Note on >4 founders (an edge case the product spec doesn't explicitly
 * cover): if more than 4 founders are ACTIVE, the first 4 are chosen by
 * ascending `championshipPlayerId` (a stable, arbitrary-but-consistent
 * tiebreak) and any remaining founders are folded into the general
 * "remaining participants" pool for the balanced-group phase.
 */
export function generateRound1Groups(
  players: ActivePlayer[],
  championshipRoundId: string
): PairingGroup[] {
  const founders = [...players.filter((p) => p.membershipTypeSnapshot === "PERMANENT")].sort(
    (a, b) =>
      a.championshipPlayerId < b.championshipPlayerId
        ? -1
        : a.championshipPlayerId > b.championshipPlayerId
          ? 1
          : 0
  );
  const associates = players.filter((p) => p.membershipTypeSnapshot !== "PERMANENT");

  if (founders.length === 0) {
    const shuffled = deterministicShuffle(
      players.map((p) => p.championshipPlayerId),
      "shuffle-remaining",
      championshipRoundId
    );
    const sizes = computeGroupSizes(shuffled.length);
    return chunkBySizes(shuffled, sizes);
  }

  const foundersForFirstGroup = founders.slice(0, FIRST_GROUP_TARGET_SIZE);
  const overflowFounders = founders.slice(FIRST_GROUP_TARGET_SIZE);

  const neededAssociates = Math.max(
    0,
    Math.min(FIRST_GROUP_TARGET_SIZE - foundersForFirstGroup.length, associates.length)
  );

  const associateIds = associates.map((p) => p.championshipPlayerId);
  const associateSelectionOrder = deterministicShuffle(
    associateIds,
    "select-associates-for-first-group",
    championshipRoundId
  );
  const selectedAssociateIds = new Set(
    associateSelectionOrder.slice(0, neededAssociates)
  );

  const firstGroupIds = [
    ...foundersForFirstGroup.map((p) => p.championshipPlayerId),
    ...associateSelectionOrder.filter((id) => selectedAssociateIds.has(id)),
  ];
  const shuffledFirstGroup = deterministicShuffle(
    firstGroupIds,
    "shuffle-first-group",
    championshipRoundId
  );

  const remainingIds = [
    ...overflowFounders.map((p) => p.championshipPlayerId),
    ...associateIds.filter((id) => !selectedAssociateIds.has(id)),
  ];
  const shuffledRemaining = deterministicShuffle(
    remainingIds,
    "shuffle-remaining",
    championshipRoundId
  );
  const remainingSizes = computeGroupSizes(shuffledRemaining.length);
  const remainingGroups = chunkBySizes(shuffledRemaining, remainingSizes);

  return [shuffledFirstGroup, ...remainingGroups];
}

function chunkBySizes(ids: string[], sizes: number[]): PairingGroup[] {
  const groups: PairingGroup[] = [];
  let index = 0;
  for (const size of sizes) {
    groups.push(ids.slice(index, index + size));
    index += size;
  }
  return groups;
}

/**
 * Generates AND persists Round 1 pairings for a championship round.
 *
 * Safeguards:
 *  - rejects if this round already has any round_groups (no silent
 *    regeneration/overwrite — a future explicit override flow is
 *    required to replace existing pairings),
 *  - only ACTIVE championship participants are included; WITHDRAWN/
 *    DISQUALIFIED are never persisted,
 *  - every ACTIVE participant is persisted exactly once, across
 *    exactly the number of groups computed by the pure pairing engine,
 *  - all writes (groups, group-player assignments, and the
 *    pairing_generations audit row) happen in a single transaction —
 *    a retry after a genuine failure will find no partial groups.
 *
 * Optionally accepts an OUTER caller-supplied transaction (`tx`) so a
 * caller that also needs another write to succeed/fail atomically
 * alongside this one (e.g. starting the championship) can compose both
 * into a single database transaction — see
 * src/lib/admin/championship-actions.ts's `startChampionshipAction`.
 * When no `tx` is given, this function opens and manages its own
 * transaction exactly as before (fully backward compatible).
 */
export async function generateAndPersistRound1Pairing(params: {
  championshipRoundId: string;
  generatedByMemberId?: string;
  tx?: DbTransaction;
}): Promise<{ groupIds: string[] }> {
  const { championshipRoundId, generatedByMemberId, tx: outerTx } = params;

  const run = async (tx: DbTransaction) => {
    const [round] = await tx
      .select({ id: championshipRounds.id, roundNumber: championshipRounds.roundNumber, championshipId: championshipRounds.championshipId })
      .from(championshipRounds)
      .where(eq(championshipRounds.id, championshipRoundId))
      .limit(1);
    if (!round) {
      throw new Error(`Championship round ${championshipRoundId} does not exist.`);
    }
    if (round.roundNumber !== 1) {
      throw new Round1PairingError(
        `generateAndPersistRound1Pairing only applies to round 1 (got round ${round.roundNumber}).`
      );
    }

    const existingGroups = await tx
      .select({ id: roundGroups.id })
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, championshipRoundId))
      .limit(1);
    if (existingGroups.length > 0) {
      throw new Round1PairingError(
        "Round 1 already has pairings — regeneration is not allowed. Use an explicit override flow instead."
      );
    }

    const allPlayers = await tx
      .select({
        id: championshipPlayers.id,
        participantStatus: championshipPlayers.participantStatus,
        membershipTypeSnapshot: championshipPlayers.membershipTypeSnapshot,
      })
      .from(championshipPlayers)
      .where(eq(championshipPlayers.championshipId, round.championshipId));

    const activePlayers: ActivePlayer[] = allPlayers
      .filter((p) => p.participantStatus === "ACTIVE")
      .map((p) => ({
        championshipPlayerId: p.id,
        membershipTypeSnapshot: p.membershipTypeSnapshot,
      }));

    if (activePlayers.length === 0) {
      throw new Round1PairingError(
        "Cannot generate Round 1 pairings — there are no active participants."
      );
    }

    const groups = generateRound1Groups(activePlayers, championshipRoundId);

    const groupIds: string[] = [];
    for (const [index, groupPlayerIds] of groups.entries()) {
      const [insertedGroup] = await tx
        .insert(roundGroups)
        .values({
          championshipRoundId,
          groupNumber: index + 1,
        })
        .returning({ id: roundGroups.id });

      groupIds.push(insertedGroup.id);

      for (const [position, championshipPlayerId] of groupPlayerIds.entries()) {
        await tx.insert(roundGroupPlayers).values({
          roundGroupId: insertedGroup.id,
          championshipRoundId,
          championshipPlayerId,
          position: position + 1,
        });
      }
    }

    await tx.insert(pairingGenerations).values({
      championshipRoundId,
      generationType: "INITIAL",
      generatedByMemberId: generatedByMemberId ?? null,
      standingsSnapshot: null,
    });

    return { groupIds };
  };

  if (outerTx) {
    return run(outerTx);
  }
  return db.transaction(run);
}
