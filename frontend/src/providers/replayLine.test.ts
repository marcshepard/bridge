import { describe, expect, it } from "vitest";
import { parseCall } from "../core/auction";
import { SAYC_DEFAULTS } from "../core/bidding/system";
import { parsePbnDeal } from "../core/deal";
import { formatReplayLine, parseReplayLine } from "./replayLine";

const DEAL = "N:AQ84.QT98.J.KQ43 K.KJ632.AT962.75 T76.54.753.AJT82 J9532.A7.KQ84.96";
const calls = ["1D", "PASS", "1H", "PASS", "2D", "PASS", "PASS", "PASS"].map((c) => parseCall(c)!);
const reported = 4;
const board = { number: 7, dealer: "S" as const, vul: "Both" as const, hands: parsePbnDeal(DEAL), field: [] };

describe("replay line", () => {
  it("writes plain SAYC as {} and only the settings that differ", () => {
    const line = formatReplayLine({
      board,
      calls,
      reported,
      systems: { NS: { ...SAYC_DEFAULTS, oneNtMin: 16, oneNtMax: 18 }, EW: SAYC_DEFAULTS },
    });
    expect(line).toBe(`For replay: 7 S Both | NS={"oneNtMin":16,"oneNtMax":18} EW={} | ${DEAL} | 1D PASS 1H PASS *2D PASS PASS PASS`);
  });

  it("reads back what it wrote", () => {
    const systems = { NS: SAYC_DEFAULTS, EW: { ...SAYC_DEFAULTS, gerber: false, ruleOf15: false } };
    const back = parseReplayLine(formatReplayLine({ board, calls, reported, systems }));
    expect(back.board).toEqual(board);
    expect(back.calls).toEqual(calls);
    expect(back.reported).toBe(reported);
    expect(back.systems).toEqual(systems);
  });

  it("reads a line a mail app wrapped, without the prefix, with P for pass", () => {
    const back = parseReplayLine(`  7 S Both |\n NS={} EW={} | N:AQ84.QT98.J.KQ43 K.KJ632.AT962.75\nT76.54.753.AJT82 J9532.A7.KQ84.96 | 1D P 1H\nP *2D P p P `);
    expect(back.calls).toEqual(calls);
    expect(back.reported).toBe(reported);
    expect(back.board.hands).toEqual(board.hands);
  });

  it("reports the last call when none is marked, and only one can be", () => {
    expect(parseReplayLine(`7 S Both | NS={} EW={} | ${DEAL} | 1D PASS 1H`).reported).toBe(2);
    expect(() => parseReplayLine(`7 S Both | NS={} EW={} | ${DEAL} | *1D PASS *1H`)).toThrow(/Only one/);
  });

  it("drops settings it doesn't know or allow", () => {
    const back = parseReplayLine(`7 S Both | NS={"oneNtMin":9,"nonsense":1} EW={} | ${DEAL} | 1D`);
    expect(back.systems.NS).toEqual(SAYC_DEFAULTS);
  });

  it("rejects a bad deal, an illegal call or a missing part", () => {
    expect(() => parseReplayLine(`7 S Both | NS={} EW={} | ${DEAL.replace("AQ84", "AQ85")} | 1D`)).toThrow();
    expect(() => parseReplayLine(`7 S Both | NS={} EW={} | ${DEAL} | 1D 1C`)).toThrow(/isn't allowed/);
    expect(() => parseReplayLine(`7 S Both | ${DEAL} | 1D`)).toThrow(/four parts/);
    expect(() => parseReplayLine(`7 S Both | NS={} EW={} | ${DEAL} |`)).toThrow(/empty/);
  });
});
