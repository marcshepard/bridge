import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { tableResult } from "../core/contract";
import { parseGameFile } from "../providers/gameFile";
import { boardOrderFrom, marginFor, newSession, nextUnplayed, sessionFromShared, tally, toStored } from "./session";

const game = parseGameFile(
  JSON.parse(readFileSync(resolve(__dirname, "../../public/games/sample-synthetic-01.json"), "utf-8")),
);

describe("sessions", () => {
  it("plays from the starting board and wraps round", () => {
    expect(boardOrderFrom([1, 2, 3, 4, 5], 4)).toEqual([4, 5, 1, 2, 3]);
  });

  it("tracks the next unplayed board and the running tally", () => {
    const s = newSession(game, "E", 23);
    expect(s.boardOrder.slice(0, 3)).toEqual([23, 24, 1]);
    expect(nextUnplayed(s)).toBe(23);

    // Copy the field's most common result on two boards: our score must equal one in the field.
    for (const n of [23, 24]) {
      const board = game.boards.find((b) => b.number === n)!;
      s.results[n] = toStored(board.field[0]!.result!);
    }
    expect(nextUnplayed(s)).toBe(1);

    const t = tally(s, game);
    expect(t.played).toBe(2);
    expect(t.rows.map((r) => r.board)).toEqual([23, 24]);
    expect(t.averagePct).toBeGreaterThan(0);
    expect(t.averagePct).toBeLessThan(100);
    // Margin is the sum of each board's net (ours − theirs, i.e. 2 × MP% − 100), rounded per board.
    expect(t.margin).toBe(t.rows.reduce((n, r) => n + Math.round(2 * r.comparison.mpPct! - 100), 0));
    expect(Number.isInteger(t.margin)).toBe(true);
  });

  it("margin: 83% is 83 − 17 = +66, average is 0, no field counts as 0", () => {
    expect(marginFor(83)).toBe(66);
    expect(marginFor(50)).toBe(0);
    expect(marginFor(20)).toBe(-60);
    expect(marginFor(null)).toBe(0);
  });

  it("builds your view of a shared game from the table's results", () => {
    const s = sessionFromShared(game, "S", 3, [
      { board: 3, contract: "PASS", declarer: null, tricks: 0 },
      { board: 4, contract: "4S", declarer: "N", tricks: 10 },
    ]);
    expect(s.boardOrder[0]).toBe(3);
    expect(Object.keys(s.results)).toEqual(["3", "4"]);
    expect(nextUnplayed(s)).toBe(5);
    expect(tally(s, game).played).toBe(2);
  });

  it("round-trips a stored result", () => {
    const r = tableResult("4SX", "N", 8);
    expect(toStored(r)).toEqual({ contract: "4SX", declarer: "N", tricks: 8 });
  });
});
