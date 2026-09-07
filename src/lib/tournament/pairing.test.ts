import { describe, expect, it } from "vitest";
import {
  computeGroupSizes,
  generateInitialPairing,
  generateNetStandingsPairing,
  type NetStandingsParticipant,
  type PairingParticipant,
} from "./pairing";

function participant(id: string, status: "ACTIVE" | "WITHDRAWN" | "DISQUALIFIED" = "ACTIVE"): PairingParticipant {
  return { championshipPlayerId: id, participantStatus: status };
}

describe("computeGroupSizes", () => {
  it("splits uneven counts into sensible 3-4 groups, avoiding a leftover singleton", () => {
    expect(computeGroupSizes(6)).toEqual([3, 3]); // not 4+2
    expect(computeGroupSizes(10)).toEqual([4, 3, 3]);
    expect(computeGroupSizes(5)).toEqual([3, 2]); // no group of 1
  });
});

describe("generateInitialPairing (Round 1)", () => {
  it("includes every ACTIVE participant exactly once and excludes WITHDRAWN/DISQUALIFIED", () => {
    const participants = [
      participant("p1"),
      participant("p2"),
      participant("p3", "WITHDRAWN"),
      participant("p4"),
      participant("p5", "DISQUALIFIED"),
      participant("p6"),
    ];
    const groups = generateInitialPairing(participants);
    const allIds = groups.flat();
    expect(allIds.sort()).toEqual(["p1", "p2", "p4", "p6"].sort());
    expect(groups.every((g) => g.length >= 3 && g.length <= 4)).toBe(true);
  });

  it("requires no standings input and groups in provided order", () => {
    const participants = ["a", "b", "c"].map((id) => participant(id));
    const groups = generateInitialPairing(participants);
    expect(groups).toEqual([["a", "b", "c"]]);
  });
});

describe("generateNetStandingsPairing (Rounds 2-4)", () => {
  function netParticipant(
    id: string,
    net: number,
    status: "ACTIVE" | "WITHDRAWN" | "DISQUALIFIED" = "ACTIVE"
  ): NetStandingsParticipant {
    return { championshipPlayerId: id, participantStatus: status, cumulativeNet: net };
  }

  it("places the leaders (lowest net) in the final group", () => {
    const participants = [
      netParticipant("worst1", 20),
      netParticipant("worst2", 18),
      netParticipant("worst3", 16),
      netParticipant("leader1", -2),
      netParticipant("leader2", -1),
      netParticipant("leader3", 0),
    ];
    const groups = generateNetStandingsPairing(participants);
    const finalGroup = groups[groups.length - 1];
    expect(finalGroup.sort()).toEqual(["leader1", "leader2", "leader3"].sort());
  });

  it("includes every ACTIVE participant exactly once, excluding WITHDRAWN/DISQUALIFIED", () => {
    const participants = [
      netParticipant("p1", 5),
      netParticipant("p2", 3, "WITHDRAWN"),
      netParticipant("p3", 1),
      netParticipant("p4", -4, "DISQUALIFIED"),
      netParticipant("p5", 7),
    ];
    const groups = generateNetStandingsPairing(participants);
    const allIds = groups.flat();
    expect(allIds.sort()).toEqual(["p1", "p3", "p5"].sort());
  });

  it("handles an uneven active count (not divisible by 4) with sensible group sizes", () => {
    const participants = Array.from({ length: 7 }, (_, i) =>
      netParticipant(`p${i}`, i)
    );
    const groups = generateNetStandingsPairing(participants);
    expect(groups.map((g) => g.length).sort()).toEqual([3, 4]);
    expect(groups.flat().length).toBe(7);
  });
});
