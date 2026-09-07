import { describe, expect, it } from "vitest";
import { calculateCumulativeNet } from "./net-score";

describe("calculateCumulativeNet", () => {
  it("J: matches the worked example — HCP 10, gross 178 after 2 rounds -> net 158", () => {
    const net = calculateCumulativeNet({
      cumulativeGross: 178,
      frozenHandicap: 10,
      completedRounds: 2,
    });
    expect(net).toBe(158);
  });

  it("J2: 1 round", () => {
    const net = calculateCumulativeNet({
      cumulativeGross: 90,
      frozenHandicap: 12,
      completedRounds: 1,
    });
    expect(net).toBe(78);
  });

  it("J3: 3 rounds", () => {
    const net = calculateCumulativeNet({
      cumulativeGross: 270,
      frozenHandicap: 15,
      completedRounds: 3,
    });
    expect(net).toBe(225);
  });

  it("J4: 4 rounds", () => {
    const net = calculateCumulativeNet({
      cumulativeGross: 360,
      frozenHandicap: 18,
      completedRounds: 4,
    });
    expect(net).toBe(288);
  });

  it("handles a zero frozen handicap (scratch player)", () => {
    const net = calculateCumulativeNet({
      cumulativeGross: 288,
      frozenHandicap: 0,
      completedRounds: 4,
    });
    expect(net).toBe(288);
  });
});
