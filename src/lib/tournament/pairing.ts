/**
 * Pure pairing-generation logic for SCAR championship rounds.
 *
 * Deliberately has NO database/framework imports — takes plain in-memory
 * participant data in and returns plain group arrays out. Persisting the
 * result into `round_groups`/`round_group_players`/`pairing_generations`
 * is a separate (future) concern; this module only decides WHO goes in
 * WHICH group.
 *
 * GROUP SIZING (used for both Round 1 and Rounds 2-4):
 *   numGroups = ceil(activeCount / 4)
 *   base = floor(activeCount / numGroups)
 *   remainder = activeCount - base * numGroups
 *   The first `remainder` groups get `base + 1` players; the rest get
 *   `base` players.
 * This keeps every group at 3-4 players whenever the active count
 * allows it, and naturally avoids a leftover singleton group in favor
 * of a more even split (e.g. 6 players -> 3+3, not 4+2; 5 players ->
 * 3+2, not 4+1). A group smaller than 3 (or of size 1) is only ever
 * produced when the active participant count itself makes it
 * unavoidable (e.g. 1 or 2 total active participants).
 */

export type ParticipantStatus = "ACTIVE" | "WITHDRAWN" | "DISQUALIFIED";

export type PairingParticipant = {
  championshipPlayerId: string;
  participantStatus: ParticipantStatus;
};

export type NetStandingsParticipant = PairingParticipant & {
  /** Cumulative net score so far — lower is better (leading). */
  cumulativeNet: number;
};

/** One generated group: an ordered list of championship player ids. */
export type PairingGroup = string[];

/**
 * Computes how many players go in each group for a given active
 * participant count. See module doc comment for the algorithm.
 */
export function computeGroupSizes(activeCount: number): number[] {
  if (activeCount <= 0) return [];
  const numGroups = Math.ceil(activeCount / 4);
  const base = Math.floor(activeCount / numGroups);
  const remainder = activeCount - base * numGroups;

  const sizes: number[] = [];
  for (let i = 0; i < numGroups; i++) {
    sizes.push(i < remainder ? base + 1 : base);
  }
  return sizes;
}

function chunkBySizes<T>(items: T[], sizes: number[]): T[][] {
  const groups: T[][] = [];
  let index = 0;
  for (const size of sizes) {
    groups.push(items.slice(index, index + size));
    index += size;
  }
  return groups;
}

/**
 * Round 1 pairing: the "initial" membership-based rule. No standings
 * exist yet, so participants are grouped in the order provided (the
 * caller is expected to pass them in whatever membership-based order
 * the club wants — e.g. alphabetical by name, or member join order;
 * this module has no member-identity data of its own, only
 * championshipPlayerId, so ordering itself is the caller's
 * responsibility). WITHDRAWN/DISQUALIFIED participants are excluded.
 * Every ACTIVE participant appears exactly once.
 */
export function generateInitialPairing(
  participants: PairingParticipant[]
): PairingGroup[] {
  const active = participants.filter((p) => p.participantStatus === "ACTIVE");
  const sizes = computeGroupSizes(active.length);
  return chunkBySizes(
    active.map((p) => p.championshipPlayerId),
    sizes
  );
}

/**
 * Rounds 2-4 pairing: net-standings-based. Lowest cumulative net = best
 * standing (leader). Leaders must be placed in the FINAL group.
 *
 * Implementation: sort ACTIVE participants ascending by net (best/
 * lowest first), then reverse so the worst standings come first —
 * chunking that reversed list by group size means the last chunk
 * (the final group) ends up containing the best/lowest-net
 * participants, i.e. the leaders. WITHDRAWN/DISQUALIFIED participants
 * are excluded and never block/shift this placement. Every ACTIVE
 * participant appears exactly once.
 */
export function generateNetStandingsPairing(
  participants: NetStandingsParticipant[]
): PairingGroup[] {
  const active = participants.filter((p) => p.participantStatus === "ACTIVE");

  const worstFirst = [...active].sort(
    (a, b) => b.cumulativeNet - a.cumulativeNet
  );

  const sizes = computeGroupSizes(active.length);
  return chunkBySizes(
    worstFirst.map((p) => p.championshipPlayerId),
    sizes
  );
}
