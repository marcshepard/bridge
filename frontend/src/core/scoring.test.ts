import { describe, expect, it } from "vitest";
import { tableResult } from "./contract";
import { scoreResult } from "./scoring";
import type { Vulnerability } from "./types";

/** Shorthand: score("4S", "S", 10, "None") → NS score. */
function ns(contract: string, declarer: string, tricks: number, vul: Vulnerability = "None") {
  return scoreResult(tableResult(contract, declarer, tricks), vul).nsScore;
}

describe("making contracts", () => {
  it.each([
    // contract, tricks, vul (for declarer N), expected
    ["1NT", 7, "None", 90],
    ["1NT", 8, "None", 120],
    ["2S", 9, "None", 140],
    ["3NT", 9, "None", 400],
    ["3NT", 9, "NS", 600],
    ["4S", 10, "None", 420],
    ["4H", 11, "NS", 650],
    ["5C", 11, "None", 400],
    ["5D", 11, "Both", 600],
    ["3C", 10, "None", 130],
    ["6H", 12, "NS", 1430],
    ["6NT", 12, "None", 990],
    ["7NT", 13, "NS", 2220],
    ["7C", 13, "None", 1440],
  ] as const)("%s by N taking %i tricks (%s vul) = %i", (c, t, v, expected) => {
    expect(ns(c, "N", t, v)).toBe(expected);
  });

  it("doubled into game", () => {
    expect(ns("2SX", "N", 8)).toBe(470); // 120 + 300 game + 50 insult
    expect(ns("2SX", "N", 8, "NS")).toBe(670);
  });

  it("doubled part score", () => {
    expect(ns("1NTX", "N", 7)).toBe(180); // 80 + 50 + 50
  });

  it("doubled and redoubled overtricks", () => {
    expect(ns("3NTX", "N", 10, "NS")).toBe(950); // 200 + 500 + 50 + 200
    expect(ns("1CXX", "N", 7)).toBe(230); // 80 + 50 + 100
    expect(ns("1CXX", "N", 8)).toBe(430); // + 200
  });

  it("the biggest possible score", () => {
    expect(ns("7NTXX", "N", 13, "NS")).toBe(2980);
  });
});

describe("failing contracts", () => {
  it.each([
    ["4S", 9, "None", -50],
    ["4S", 9, "NS", -100],
    ["4SX", 9, "None", -100],
    ["4SX", 8, "None", -300],
    ["4SX", 7, "None", -500],
    ["4SX", 6, "None", -800],
    ["4SX", 5, "None", -1100],
    ["4SX", 9, "NS", -200],
    ["4SX", 8, "NS", -500],
    ["4SX", 7, "NS", -800],
    ["4SX", 6, "NS", -1100],
    ["4SXX", 9, "None", -200],
    ["4SXX", 8, "None", -600],
    ["4SXX", 7, "None", -1000],
    ["4SXX", 6, "None", -1600],
    ["4SXX", 9, "NS", -400],
    ["4SXX", 8, "NS", -1000],
    ["7NTX", 0, "NS", -3800],
  ] as const)("%s by N taking %i tricks (%s vul) = %i", (c, t, v, expected) => {
    expect(ns(c, "N", t, v)).toBe(expected);
  });
});

describe("direction and vulnerability", () => {
  it("East–West declarer scores negative for NS", () => {
    expect(ns("4H", "E", 10, "EW")).toBe(-620);
    expect(ns("4H", "E", 9, "EW")).toBe(100);
  });

  it("uses declarer's side's vulnerability, not the opponents'", () => {
    expect(ns("4H", "E", 10, "NS")).toBe(-420);
  });

  it("passed out scores zero", () => {
    expect(ns("PASS", "N", 0)).toBe(0);
  });
});

describe("breakdown lines", () => {
  it("explains 1NT+1", () => {
    const b = scoreResult(tableResult("1NT", "E", 8), "None");
    expect(b.lines.map((l) => [l.label, l.points])).toEqual([
      ["Contract tricks (1NT)", 40],
      ["Part-score bonus", 50],
      ["Overtrick", 30],
    ]);
    expect(b.declarerScore).toBe(120);
    expect(b.nsScore).toBe(-120);
  });

  it("explains a vulnerable slam", () => {
    const b = scoreResult(tableResult("6H", "S", 13), "Both");
    expect(b.lines.map((l) => [l.label, l.points])).toEqual([
      ["Contract tricks (6♥)", 180],
      ["Game bonus", 500],
      ["Small slam bonus", 750],
      ["Overtrick", 30],
    ]);
  });

  it("splits doubled undertricks into bands", () => {
    const b = scoreResult(tableResult("4SX", "N", 5), "None");
    expect(b.lines.map((l) => [l.label, l.points])).toEqual([
      ["1st undertrick", -100],
      ["2nd–3rd undertricks", -400],
      ["4th–5th undertricks", -600],
    ]);
  });

  it("lines always add up to the total", () => {
    for (const c of ["1C", "3NT", "4SX", "6DXX", "7NT"]) {
      for (let t = 0; t <= 13; t++) {
        for (const v of ["None", "NS", "EW", "Both"] as const) {
          const b = scoreResult(tableResult(c, "N", t), v);
          expect(b.lines.reduce((s, l) => s + l.points, 0)).toBe(b.declarerScore);
        }
      }
    }
  });
});
