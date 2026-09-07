import { describe, expect, it } from "vitest";
import {
  evaluateRoundCompletion,
  type RoundParticipant,
} from "./round-completion";

describe("evaluateRoundCompletion", () => {
  it("K: a WITHDRAWN participant without a scorecard does not block completion", () => {
    const participants: RoundParticipant[] = [
      { championshipPlayerId: "a", participantStatus: "ACTIVE" },
      { championshipPlayerId: "b", participantStatus: "WITHDRAWN" },
    ];
    const result = evaluateRoundCompletion(participants, (id) => id === "a");
    expect(result.isComplete).toBe(true);
    expect(result.outstandingParticipantIds).toEqual([]);
  });

  it("K2: a DISQUALIFIED participant without a scorecard does not block completion", () => {
    const participants: RoundParticipant[] = [
      { championshipPlayerId: "a", participantStatus: "ACTIVE" },
      { championshipPlayerId: "b", participantStatus: "DISQUALIFIED" },
    ];
    const result = evaluateRoundCompletion(participants, (id) => id === "a");
    expect(result.isComplete).toBe(true);
  });

  it("L: an ACTIVE participant without a complete scorecard DOES block completion", () => {
    const participants: RoundParticipant[] = [
      { championshipPlayerId: "a", participantStatus: "ACTIVE" },
      { championshipPlayerId: "b", participantStatus: "ACTIVE" },
    ];
    const result = evaluateRoundCompletion(participants, (id) => id === "a");
    expect(result.isComplete).toBe(false);
    expect(result.outstandingParticipantIds).toEqual(["b"]);
  });

  it("M: an ACTIVE participant with a complete submitted scorecard counts as complete", () => {
    const participants: RoundParticipant[] = [
      { championshipPlayerId: "a", participantStatus: "ACTIVE" },
    ];
    const result = evaluateRoundCompletion(participants, () => true);
    expect(result.isComplete).toBe(true);
    expect(result.outstandingParticipantIds).toEqual([]);
  });

  it("a mix of ACTIVE (complete), WITHDRAWN, and DISQUALIFIED is complete", () => {
    const participants: RoundParticipant[] = [
      { championshipPlayerId: "a", participantStatus: "ACTIVE" },
      { championshipPlayerId: "b", participantStatus: "WITHDRAWN" },
      { championshipPlayerId: "c", participantStatus: "DISQUALIFIED" },
    ];
    const result = evaluateRoundCompletion(participants, (id) => id === "a");
    expect(result.isComplete).toBe(true);
  });

  it("an empty participant list is trivially complete", () => {
    const result = evaluateRoundCompletion([], () => false);
    expect(result.isComplete).toBe(true);
  });
});
