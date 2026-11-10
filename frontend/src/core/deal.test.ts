import { describe, expect, it } from "vitest";
import { assertValidDeal, boardDealer, boardVulnerability, handToString, randomDeal } from "./deal";
import { seeded } from "./random";
import { SEATS } from "./types";

describe("randomDeal", () => {
  it("deals all 52 cards, 13 to each seat, each suit high to low", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const deal = randomDeal(seeded(seed));
      expect(() => assertValidDeal(deal)).not.toThrow();
      for (const seat of SEATS) {
        for (const ranks of Object.values(deal[seat])) {
          expect(ranks).toBe([...ranks].sort((a, b) => "AKQJT98765432".indexOf(a) - "AKQJT98765432".indexOf(b)).join(""));
        }
      }
    }
  });

  it("gives the same deal for the same seed, and a different one for another", () => {
    const text = (seed: number) => SEATS.map((s) => handToString(randomDeal(seeded(seed))[s])).join(" ");
    expect(text(7)).toBe(text(7));
    expect(text(7)).not.toBe(text(8));
  });
});

describe("board dealer and vulnerability", () => {
  it.each([
    [1, "N", "None"], [2, "E", "NS"], [3, "S", "EW"], [4, "W", "Both"],
    [5, "N", "NS"], [8, "W", "None"], [9, "N", "EW"], [12, "W", "NS"],
    [13, "N", "Both"], [16, "W", "EW"], [17, "N", "None"], [36, "W", "Both"],
  ] as const)("board %i: %s deals, %s vulnerable", (board, dealer, vul) => {
    expect(boardDealer(board)).toBe(dealer);
    expect(boardVulnerability(board)).toBe(vul);
  });
});
