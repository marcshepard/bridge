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

describe("every card from a position", () => {
  it("scores each opening lead; the best equals the defence's tricks in the table", async () => {
    const b = boards[0]!;
    const table = await solver.table(b.hands);
    const [scores] = await solver.cards([{ hands: b.hands, trump: "H", leader: "S", trick: [] }]);
    const sCards = Object.values(b.hands.S).join("").length;
    expect(scores!.length).toBe(sCards); // every card of South's, equal ones listed one by one
    expect(Math.max(...scores!.map((s) => s.tricks))).toBe(13 - table.E.H);
  });

  it("solves part-way through a trick", async () => {
    const b = boards[0]!;
    // South leads a card; now West (next) is to play: it scores for East–West's side.
    const [leads] = await solver.cards([{ hands: b.hands, trump: "H", leader: "S", trick: [] }]);
    const lead = leads![0]!.card;
    const hands = { ...b.hands, S: { ...b.hands.S, [lead.suit]: b.hands.S[lead.suit].replace(lead.rank, "") } };
    const [follows] = await solver.cards([{ hands, trump: "H", leader: "S", trick: [lead] }]);
    // West's best play leaves North–South with what the lead was worth.
    expect(13 - Math.max(...follows!.map((s) => s.tricks))).toBe(leads![0]!.tricks);
  });
});

describe("freak deals", () => {
  it("solves a contract when each hand is nearly one suit (DDS 3.1.1's quick mode gets these wrong)", async () => {
    const hands = {
      N: { S: "AKQJT9876543", H: "2", D: "", C: "" },
      E: { S: "2", H: "AKQJT9876543", D: "", C: "" },
      S: { S: "", H: "", D: "", C: "AKQJT98765432" },
      W: { S: "", H: "", D: "AKQJT98765432", C: "" },
    };
    const table = await solver.table(hands);
    const [tricks] = await solver.tricks([{ hands, strain: "H", declarer: "E" }]);
    expect(tricks).toBe(table.E.H);
  });
});
