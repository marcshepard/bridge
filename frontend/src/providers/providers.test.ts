import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compareBoard, scoreField } from "../core/compare";
import { handToString, parsePbnDeal } from "../core/deal";
import { scoreResult } from "../core/scoring";
import { parseGameFile } from "./gameFile";
import { pbnToGameFile } from "./pbn";

const DEAL = "N:AQ84.QT98.J.KQ43 K.KJ632.AT962.75 T76.54.753.AJT82 J9532.A7.KQ84.96";

/** A PBN deal as the game file's hands ("S.H.D.C" by seat). */
function handsOf(deal: string): Record<string, string> {
  const d = parsePbnDeal(deal);
  return { N: handToString(d.N), E: handToString(d.E), S: handToString(d.S), W: handToString(d.W) };
}

describe("bundled sample game", () => {
  const file = JSON.parse(
    readFileSync(resolve(__dirname, "../../public/games/sample-synthetic-01.json"), "utf-8"),
  );
  const game = parseGameFile(file);

  it("loads 24 valid boards with no warnings", () => {
    expect(game.boards).toHaveLength(24);
    expect(game.warnings).toEqual([]);
  });

  it("every board has a field, double-dummy tricks and a par score", () => {
    for (const b of game.boards) {
      expect(b.field.length).toBeGreaterThan(0);
      expect(b.doubleDummy?.par).toBeDefined();
    }
  });

  it("par contracts score the par score", () => {
    for (const b of game.boards) {
      const par = b.doubleDummy!.par!;
      for (const c of par.contracts) {
        expect(scoreResult(c, b.vul).nsScore, `board ${b.number}`).toBe(par.nsScore);
      }
    }
  });

  it("can be compared end to end", () => {
    const b = game.boards[0]!;
    const c = compareBoard(b.field[0]!.result!, "NS", b.vul, scoreField(b.field, b.vul));
    expect(c.mpPct).not.toBeNull();
    expect(c.fieldSize).toBe(b.field.reduce((n, f) => n + f.count, 0));
  });
});

describe("game file validation", () => {
  const base = {
    schemaVersion: 1,
    id: "t",
    boards: [{ number: 1, dealer: "N", vul: "None", hands: {} as Record<string, string>, field: [] as unknown[] }],
  };
  const [n, e, s, w] = DEAL.slice(2).split(" ");
  base.boards[0]!.hands = { N: n!, E: e!, S: s!, W: w! };

  it("rejects a deal with a duplicated card", () => {
    const bad = structuredClone(base);
    bad.boards[0]!.hands.N = "AQ84.QT98.J.KQ44";
    expect(() => parseGameFile(bad)).toThrow(/Board 1/);
  });

  it("warns (and uses the rules) when a field score disagrees with its contract", () => {
    const f = structuredClone(base);
    f.boards[0]!.field = [{ contract: "4S", declarer: "S", tricks: 10, nsScore: 450 }];
    const game = parseGameFile(f);
    expect(game.warnings[0]).toMatch(/file says 450, rules give 420/);
  });

  it("skips an unreadable traveller line rather than failing the game", () => {
    const f = structuredClone(base);
    f.boards[0]!.field = [{ contract: "9Z", declarer: "S", tricks: 10 }, { contract: "PASS" }];
    const game = parseGameFile(f);
    expect(game.boards[0]!.field).toHaveLength(1);
    expect(game.warnings).toHaveLength(1);
  });
});

describe("PBN import", () => {
  const pbn = `% PBN 2.1
[Event "Thursday Afternoon"]
[Date "2021.12.03"]
[Board "1"]
[Dealer "N"]
[Vulnerable "None"]
[Deal "${DEAL}"]
[DoubleDummyTricks "99999888887777766666"]
[OptimumScore "EW 130"]
[ScoreTable "PairId_NS\\2R;PairId_EW\\2R;Contract\\5L;Declarer\\1R;Result\\2R;Score_NS\\6R"]
 1  9 4D    E  10   -130
 2 10 4D    W  10   -130
 3 11 3NTX  N   7   -300
 4 12 -     -   -      -
{ Expert note: East should
open 1H. }

[Event "#"]
[Board "2"]
[Dealer "E"]
[Vulnerable "NS"]
[Deal "${DEAL}"]
[Contract "2H"]
[Declarer "E"]
[Result "+1"]

[Event "#"]
[Board "2"]
[Dealer "E"]
[Vulnerable "NS"]
[Deal "${DEAL}"]
[Contract "Pass"]
`;

  it("reads deals, travellers, double dummy and commentary", () => {
    const game = parseGameFile(pbnToGameFile(pbn, "thu-pm.pbn"));
    expect(game.summary.title).toBe("Thursday Afternoon (thu-pm)");
    expect(game.summary.date).toBe("2021-12-03");
    expect(game.warnings).toEqual([]);

    const [b1, b2] = game.boards;
    expect(b1!.field.map((f) => [f.result!.contract?.level, f.result!.declarer, f.result!.tricks, f.count])).toEqual([
      [4, "E", 10, 1],
      [4, "W", 10, 1],
      [3, "N", 7, 1],
    ]);
    expect(b1!.commentary).toBe("Expert note: East should\nopen 1H.");
    expect(b1!.doubleDummy?.par?.nsScore).toBe(-130);

    // Board 2 came as one game per table: merged into one field.
    expect(b2!.field).toHaveLength(2);
    expect(b2!.field[0]!.result!.tricks).toBe(9);
    expect(b2!.field[1]!.result!.contract).toBeNull();
  });

  it("imports a hand-record-only file with an empty field", () => {
    const game = parseGameFile(
      pbnToGameFile(`[Board "3"]\n[Dealer "S"]\n[Vulnerable "EW"]\n[Deal "${DEAL}"]\n`, "hr.pbn"),
    );
    expect(game.boards[0]!.field).toEqual([]);
  });
});

describe("score-only field results in the game file", () => {
  const file = (field: unknown[]) => ({
    schemaVersion: 1,
    id: "t",
    boards: [{ number: 1, dealer: "N", vul: "None", hands: handsOf(DEAL), field }],
  });

  it("keeps the N/S score and count when there is no contract", () => {
    const game = parseGameFile(file([{ nsScore: 110, count: 45 }, { contract: "2S", declarer: "N", tricks: 8 }]));
    expect(game.boards[0]!.field).toEqual([
      { result: null, nsScore: 110, count: 45 },
      expect.objectContaining({ count: 1 }),
    ]);
    expect(game.warnings).toEqual([]);
  });

  it("skips a score-only line whose score is missing or not a whole ten, with a warning", () => {
    const game = parseGameFile(file([{ count: 2 }, { nsScore: 115 }, { nsScore: -50 }]));
    expect(game.boards[0]!.field).toHaveLength(1);
    expect(game.warnings).toHaveLength(2);
  });

  it("accepts a par score without the double-dummy tricks", () => {
    const f = file([]);
    (f.boards[0] as Record<string, unknown>).doubleDummy = { par: { nsScore: 110 } };
    const dd = parseGameFile(f).boards[0]!.doubleDummy!;
    expect(dd.tricks).toBeUndefined();
    expect(dd.par?.nsScore).toBe(110);
  });
});
