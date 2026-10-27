import { describe, expect, it } from "vitest";
import { compareBoard, scoreField } from "./compare";
import { tableResult } from "./contract";
import { describeResult } from "./describe";
import { datum, imps } from "./imps";
import { scoreResult } from "./scoring";

const r = tableResult;

describe("matchpoints against the field", () => {
  // Board with nobody vulnerable. We are EW and defeat 2♠ by N two tricks: EW +100.
  // Field, from EW's point of view: −120, −50, +50, +100, +100, +200.
  const field = scoreField(
    [
      { result: r("1NT", "N", 8) }, // NS +120 → EW −120
      { result: r("3D", "E", 8) }, // EW −50
      { result: r("2H", "N", 7) }, // EW +50
      { result: r("2S", "N", 6) }, // EW +100
      { result: r("3C", "S", 7) }, // EW +100
      { result: r("4S", "N", 6) }, // EW +200
    ],
    "None",
  );

  it("beats 3, ties 2, loses 1 → 66.7%", () => {
    const c = compareBoard(r("2S", "N", 6), "EW", "None", field);
    expect(c.ourScore).toBe(100);
    expect([c.beat, c.tied, c.lost]).toEqual([3, 2, 1]);
    expect(c.mpPct).toBeCloseTo(66.67, 1);
  });

  it("works when nobody in the field had our contract", () => {
    // 7NT by N down 7 doubled — nobody else did this, but the score still ranks.
    const c = compareBoard(r("7NTX", "N", 6), "EW", "None", field);
    expect(c.mpPct).toBe(100);
  });

  it("groups the field by score, best for us first, and flags our score", () => {
    const c = compareBoard(r("2S", "N", 6), "EW", "None", field);
    expect(c.groups.map((g) => [g.score, g.count])).toEqual([
      [200, 1],
      [100, 2],
      [50, 1],
      [-50, 1],
      [-120, 1],
    ]);
    expect(c.groups.find((g) => g.isOurs)?.score).toBe(100);
    expect(c.mostCommon?.score).toBe(100);
  });

  it("respects counts on merged field results", () => {
    const merged = scoreField([{ result: r("4S", "S", 10), count: 9 }, { result: r("4S", "S", 11) }], "None");
    const c = compareBoard(r("4S", "N", 10), "NS", "None", merged);
    expect(c.fieldSize).toBe(10);
    expect(c.mpPct).toBeCloseTo(45, 5); // tie 9 (4.5) of 10
    // Same contract and tricks, different declarer → still one score group, two result lines.
    expect(c.groups.length).toBe(2);
  });

  it("returns null % for an empty field", () => {
    const c = compareBoard(r("3NT", "N", 9), "NS", "None", []);
    expect(c.mpPct).toBeNull();
    expect(c.impsVsDatum).toBe(0);
  });
});

describe("IMPs", () => {
  it.each([
    [0, 0],
    [10, 0],
    [20, 1],
    [50, 2],
    [-430, -10],
    [620, 12],
    [1440, 16],
    [4000, 24],
    [9999, 24],
  ])("%i → %i IMPs", (diff, expected) => expect(imps(diff)).toBe(expected));

  it("datum rounds the average to 10", () => {
    expect(datum([420, 420, 450, -50])).toBe(310);
  });
});

describe("result descriptions", () => {
  const d = (c: string, decl: string, t: number, vul = "None" as const) =>
    describeResult(scoreResult(r(c, decl, t), vul));

  it.each([
    ["PASS", "N", 0, "Passed out"],
    ["2H", "N", 8, "Part score made"],
    ["3NT", "N", 10, "Game made with 1 overtrick"],
    ["4S", "N", 9, "Game down 1"],
    ["6H", "S", 12, "Small slam made"],
    ["7NT", "S", 11, "Grand slam down 2"],
    ["2SX", "E", 8, "Doubled part score (doubled into game) made"],
    ["4SX", "E", 7, "Doubled game down 3"],
    ["1NTXX", "W", 9, "Redoubled part score (redoubled into game) made with 2 overtricks"],
    ["3NTX", "W", 9, "Doubled game made"],
  ])("%s by %s taking %i → %s", (c, decl, t, expected) => expect(d(c, decl, t)).toBe(expected));
});
