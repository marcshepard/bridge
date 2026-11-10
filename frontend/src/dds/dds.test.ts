import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseGameFile } from "../providers/gameFile";
import { STRAINS } from "../core/types";
import { SyncSolver } from "./syncSolver";

// The demo game's double dummy was computed with DDS 2 (through endplay); this is DDS 3 in
// WebAssembly. Board 9 is a test deal whose stored double dummy is still the original deal's.
const game = parseGameFile(JSON.parse(readFileSync(new URL("../../../backend/src/demo/demo-game.json", import.meta.url), "utf8")));
const boards = game.boards.filter((b) => b.number !== 9 && b.doubleDummy?.tricks).slice(0, 6);
const solver = new SyncSolver();

describe("double dummy (DDS in WebAssembly)", () => {
  it("matches the stored tables", async () => {
    for (const b of boards) expect(await solver.table(b.hands), `board ${b.number}`).toEqual(b.doubleDummy!.tricks);
  });

  it("solves single contracts the same as the table", async () => {
    const b = boards[0]!;
    const jobs = (["N", "E"] as const).flatMap((declarer) => STRAINS.map((strain) => ({ hands: b.hands, strain, declarer })));
    const tricks = await solver.tricks(jobs);
    jobs.forEach((j, i) => expect(tricks[i], `${j.declarer} ${j.strain}`).toBe(b.doubleDummy!.tricks![j.declarer][j.strain]));
  });
});
