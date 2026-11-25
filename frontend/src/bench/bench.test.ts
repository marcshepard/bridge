import { describe, expect, it } from "vitest";
import { parseHand } from "../core/deal";
import { SUITS } from "../core/types";
import { type SetDefinition, dealSet, ewLayouts, handsOf, hasClearBid } from "./deals";
import { type ContractOption, contractClass, contractOptions, encodeTricks, expectedLoss, missKind, optionFor, tricksOf } from "./ideal";
import { type RunFile, bootstrapCi, compareLosses, slamsByHcp } from "./report";
import { type BoardResult, silentAuction, situationTags } from "./stage1";
import { DEFAULT_WEAK_SET, encodeTable, parScore, preemptorOf, runWeakBoard, tableTricks, weakDealSet, weakKind } from "./weak";
import { SAYC_DEFAULTS } from "../core/bidding/system";
import { evaluate, meetsStandard } from "../core/bidding/evaluate";
import type { DoubleDummyTable } from "../core/doubleDummy";

const def: SetDefinition = { stage: 1, deals: 8, seed: 3, layouts: 12, filter: 1 };

/** A layout's 10 trick counts: North in ♣ ♦ ♥ ♠ NT, then South. */
const layout = (north: number[], south: number[]) => [...north, ...south].map((t) => t.toString(16)).join("");

describe("the no-clear-bid filter", () => {
  it.each([
    ["an opening hand", "AK4.Q32.J543.K32", true],
    ["rule of 20 with 11 HCP", "AQ842.KJ53.4.J32", true],
    ["a preempt", "KQT9854.4.32.432", true],
    ["a 6-card suit with 8 HCP", "KQJ854.Q4.432.32", true],
    ["a 5-5 with 8 HCP", "QJ853.KQ642.3.32", true],
    ["a 5-card suit with 10 HCP", "AKJ53.Q4.J32.432", true],
    ["a weak balanced hand", "Q32.J54.K432.432", false],
    ["a 6-card suit with 6 HCP", "KJ8543.Q4.432.32", false],
    ["a weak 5-4", "QJ853.K642.32.32", false],
  ])("%s", (_, hand, clear) => expect(hasClearBid(parseHand(hand))).toBe(clear));
});

describe("deal sets", () => {
  it("deals the same boards every time, with East and West silent and the usual rotation", () => {
    const deals = dealSet(def);
    expect(dealSet(def)).toEqual(deals);
    expect(deals.map((d) => d.dealer).join("")).toBe("NESWNESW");
    expect(deals.map((d) => d.vul).slice(0, 4)).toEqual(["None", "NS", "EW", "Both"]);
    for (const d of deals) {
      const h = handsOf(d);
      expect(hasClearBid(h.E) || hasClearBid(h.W)).toBe(false);
    }
  });

  it("deals East–West layouts around the real North–South hands, all silent, repeatably", () => {
    const deal = dealSet(def)[0]!;
    const real = handsOf(deal);
    const layouts = ewLayouts(deal, def);
    expect(layouts).toHaveLength(def.layouts);
    expect(ewLayouts(deal, def)).toEqual(layouts);
    const cards = (h: typeof real) => SUITS.map((s) => [...h.E[s], ...h.W[s]].sort().join("")).join("|");
    for (const l of layouts) {
      expect(l.N).toEqual(real.N);
      expect(l.S).toEqual(real.S);
      expect(cards(l)).toBe(cards(real));
      expect(hasClearBid(l.E) || hasClearBid(l.W)).toBe(false);
    }
  });
});

describe("the ideal contract", () => {
  it("stores and reads back each declarer's tricks", () => {
    const table = {
      N: { C: 9, D: 8, H: 7, S: 10, NT: 13 },
      S: { C: 1, D: 2, H: 3, S: 4, NT: 0 },
      E: { C: 0, D: 0, H: 0, S: 0, NT: 0 },
      W: { C: 0, D: 0, H: 0, S: 0, NT: 0 },
    };
    const l = encodeTricks(table);
    expect(l).toHaveLength(10);
    expect(tricksOf(l, "N", "NT")).toBe(13);
    expect(tricksOf(l, "N", "S")).toBe(10);
    expect(tricksOf(l, "S", "H")).toBe(3);
  });

  it("finds the best average and the loss of others (the worked example in HARNESS.md)", () => {
    // Clubs by South: 8 tricks on 5 layouts, 9 on 25, 10 on 20. Notrump by North: 6, 7, 8, 9 tricks
    // on 10, 20, 15, 5 layouts. Nothing else makes.
    const clubs = [...Array(5).fill(8), ...Array(25).fill(9), ...Array(20).fill(10)] as number[];
    const nt = [...Array(10).fill(6), ...Array(20).fill(7), ...Array(15).fill(8), ...Array(5).fill(9)] as number[];
    const layouts = clubs.map((c, i) => layout([0, 0, 0, 0, nt[i]!], [c, 0, 0, 0, 0]));
    const options = contractOptions(layouts, "None");
    const mean = (code: string, by: "N" | "S") => optionFor(options, { level: Number(code[0]), strain: code.slice(1) as "C", doubling: "" }, by).mean;
    expect(mean("2C", "S")).toBe(116);
    expect(mean("3C", "S")).toBe(102);
    expect(mean("1NT", "N")).toBe(77);
    expect(mean("3NT", "N")).toBe(-45);
    expect(mean("5C", "S")).toBe(-85);
    // 1♣ scores the same as 2♣ on every layout here, and the lower level wins the tie.
    const ideal = options[0]!;
    expect(ideal.contract).toEqual({ level: 1, strain: "C", doubling: "" });
    expect(ideal.declarer).toBe("S");
    expect(expectedLoss(ideal, optionFor(options, { level: 2, strain: "C", doubling: "" }, "S"))).toBe(0);
    const loss = (code: string, by: "N" | "S") => expectedLoss(ideal, optionFor(options, { level: Number(code[0]), strain: code.slice(1) as "C", doubling: "" }, by));
    // Layouts pair the trick counts in the order above, best with best.
    expect(loss("3C", "S")).toBeCloseTo(0.4, 5);
    expect(loss("1NT", "N")).toBeCloseTo(1.1, 5);
    expect(loss("3NT", "N")).toBeCloseTo(4, 5);
    expect(loss("5C", "S")).toBeCloseTo(5.1, 5);
  });

  it("measures loss layout by layout, in IMPs", () => {
    const opt = (scores: number[]): ContractOption => ({ contract: null, declarer: null, scores, mean: 0 });
    // 420 against −50 is 10 IMPs; 420 against 450 is −1: an average loss of 4.5.
    expect(expectedLoss(opt([420, 420]), opt([-50, 450]))).toBe(4.5);
  });

  it("passing out is an option, worth 0", () => {
    const options = contractOptions([layout([0, 0, 0, 0, 0], [0, 0, 0, 0, 0])], "Both");
    expect(options[0]!.contract).toBeNull();
    expect(options[0]!.mean).toBe(0);
  });

  it("classifies contracts and misses", () => {
    const c = (level: number, strain: "C" | "H" | "NT") => ({ level, strain, doubling: "" as const });
    expect([null, c(4, "C"), c(5, "C"), c(3, "NT"), c(4, "H"), c(6, "H"), c(7, "NT")].map(contractClass)).toEqual([0, 1, 2, 2, 2, 3, 4]);
    const o = (contract: ReturnType<typeof c> | null, declarer: "N" | "S" | null): ContractOption => ({ contract, declarer, scores: [], mean: 0 });
    const ideal = o(c(4, "H"), "N");
    expect(missKind(o(c(4, "H"), "N"), ideal, 0)).toBe("At or near the ideal");
    expect(missKind(o(c(4, "H"), "S"), ideal, 2)).toBe("Wrong declarer");
    expect(missKind(o(c(3, "H"), "N"), ideal, 6)).toBe("Too low");
    expect(missKind(o(c(6, "H"), "N"), ideal, 6)).toBe("Too high");
    expect(missKind(o(c(3, "NT"), "N"), ideal, 6)).toBe("Wrong strain");
    expect(missKind(o(null, null), ideal, 6)).toBe("Too low");
  });
});

describe("bidding with the opponents silent", () => {
  it("East and West pass throughout and the auction ends", () => {
    for (const d of dealSet(def)) {
      const decisions = silentAuction(handsOf(d), d);
      const seats = ["N", "E", "S", "W"];
      decisions.forEach((x, i) => {
        const seat = seats[(seats.indexOf(d.dealer) + i) % 4];
        if (seat === "E" || seat === "W") expect(x.call.kind).toBe("pass");
      });
      expect(decisions.slice(-3).every((x) => x.call.kind === "pass")).toBe(true);
    }
  });

  it("tags the opening, the conventions used and a late opening", () => {
    const pass = { call: { kind: "pass" as const }, meaning: "", reason: "", name: null, hard: null, fallback: false };
    const bid = (level: number, strain: "NT" | "C", name: string | null) => ({ ...pass, call: { kind: "bid" as const, level, strain }, name });
    // Dealer West: West passes, North opens 1NT in second seat, East passes, South bids Stayman.
    const tags = situationTags({ dealer: "W" }, [pass, bid(1, "NT", null), pass, bid(2, "C", "Stayman"), pass, pass, pass]);
    expect(tags).toEqual(["1NT opening", "Stayman"]);
    const late = situationTags({ dealer: "N" }, [pass, pass, bid(1, "NT", null), pass, pass, pass]);
    expect(late).toContain("Opened in third or fourth seat");
    expect(situationTags({ dealer: "N" }, [pass, pass, pass, pass])).toEqual(["Passed out"]);
  });
});

describe("statistics", () => {
  it("gives a zero-width interval for constant values", () => {
    expect(bootstrapCi([2, 2, 2])).toEqual([2, 2]);
  });

  it("calls a change better only when the whole interval is below zero", () => {
    expect(compareLosses([1, 1, 1, 1], [2, 2, 2, 2]).verdict).toBe("better");
    expect(compareLosses([3, 3, 3, 3], [2, 2, 2, 2]).verdict).toBe("worse");
    expect(compareLosses([1, 3, 1, 3], [2, 2, 2, 2]).verdict).toBe("no clear difference");
  });
});

describe("slams by combined HCP", () => {
  const board = (id: number, nsHcp: number | undefined, contract: string, ideal: string, loss: number): BoardResult => ({
    id, auction: "", contract, declarer: "N", loss, ideal, idealDeclarer: "N", idealClass: "", miss: "At or near the ideal", tags: [], fallbacks: 0, nsHcp,
  });
  const run = (boards: BoardResult[]): RunFile => ({ id: "r", set: "s", label: "", commit: "", dirty: false, createdAt: "", ms: 0, boards });

  it("counts slams bid and ideal in each band, against the baseline", () => {
    const now = run([board(1, 34, "6NT", "6NT", 0), board(2, 33, "3NT", "6NT", 11), board(3, 27, "6S", "4S", 13)]);
    const before = run([board(1, undefined, "3NT", "6NT", 11), board(2, undefined, "3NT", "6NT", 11), board(3, undefined, "4S", "4S", 0)]);
    const [, top, low] = slamsByHcp(now, before); // bands with no boards are left out
    // 33+: both ideal slams, one bid (50%) where the baseline bid none; loss 5.50, 5.50 better.
    expect(top).toMatch(/33\+\s+2\s+100\.0%\s+50\.0%\s+0\.0%\s+0\s+5\.50\s+−5\.50/);
    // 26–28: a slam bid where the ideal is game: one "not ideal".
    expect(low).toMatch(/26–28\s+1\s+0\.0%\s+100\.0%\s+0\.0%\s+1\s+13\.00\s+\+13\.00/);
  });

  it("is left out for runs recorded before HCP were", () => {
    expect(slamsByHcp(run([board(1, undefined, "3NT", "6NT", 11)]), null)).toEqual([]);
  });
});

describe("the weak-opening experiment", () => {
  it("recognises weak-two and preempt hands whatever the suit", () => {
    expect(weakKind(parseHand("KT9852.J3.A64.93"))).toEqual({ kind: "two", suit: "S" });
    expect(weakKind(parseHand("9876543.J3.A6.93"))).toEqual({ kind: "three", suit: "S" });
    // A side four-card major isn't a weak two; nor is a strong hand.
    expect(weakKind(parseHand("KT9852.J932.A6.9"))).toBeNull();
    expect(weakKind(parseHand("AK9852.KJ3.A6.93"))).toBeNull();
  });

  it("keeps deals whose first opener in seats one to three has the weak hand", () => {
    const deals = weakDealSet({ ...DEFAULT_WEAK_SET, deals: 20 });
    expect(deals).toHaveLength(20);
    for (const d of deals) expect(preemptorOf(handsOf(d), d.dealer)).toBe(d.preemptor);
  });

  it("encodes a double-dummy table and reads it back", () => {
    const t = Object.fromEntries(["N", "E", "S", "W"].map((s, i) => [s, { C: i, D: i + 1, H: i + 2, S: i + 3, NT: 13 - i }])) as DoubleDummyTable;
    const code = encodeTable(t);
    expect(code).toHaveLength(20);
    expect(tableTricks(code, "E", "S")).toBe(4);
    expect(tableTricks(code, "W", "NT")).toBe(10);
  });

  it("scores the same card both ways as no difference", () => {
    const deal = weakDealSet({ ...DEFAULT_WEAK_SET, deals: 3 })[2]!;
    const b = runWeakBoard(deal, "7".repeat(20), SAYC_DEFAULTS, SAYC_DEFAULTS);
    expect(b.base.auction).toBe(b.variant.auction);
    expect(b.imps).toBe(0);
  });

  // A table where North–South take `ns` tricks and East–West `ew`, in every strain.
  const flat = (ns: number, ew: number) =>
    encodeTable(Object.fromEntries(["N", "E", "S", "W"].map((s) => [s, Object.fromEntries(["C", "D", "H", "S", "NT"].map((x) => [x, s === "N" || s === "S" ? ns : ew]))])) as DoubleDummyTable);

  it("works out par from the table", () => {
    // Nobody makes anything: passed out.
    expect(parScore(flat(6, 6), "None", "N")).toBe(0);
    // North–South take all thirteen: 7NT, not vulnerable.
    expect(parScore(flat(13, 0), "None", "N")).toBe(1520);
    // North–South make 4♠ (ten tricks) vulnerable; East–West, not vulnerable, take 8: sacrificing in
    // 5♣ doubled costs 500 (three down), less than the 620 game, so par is the sacrifice.
    const t = encodeTable({
      N: { C: 3, D: 3, H: 8, S: 10, NT: 8 }, S: { C: 3, D: 3, H: 8, S: 10, NT: 8 },
      E: { C: 8, D: 8, H: 3, S: 3, NT: 3 }, W: { C: 8, D: 8, H: 3, S: 3, NT: 3 },
    });
    expect(parScore(t, "NS", "N")).toBe(500);
  });

  it("applies the suit standards", () => {
    const h = evaluate(parseHand("KT9852.J3.A64.93"));
    expect(meetsStandard(h, "S", "any")).toBe(true);
    expect(meetsStandard(h, "S", "decent")).toBe(true);
    expect(meetsStandard(h, "S", "good")).toBe(false);
    expect(meetsStandard(evaluate(parseHand("985432.J3.A64.93")), "S", "decent")).toBe(false);
    // 3+ HCP in the suit: a king, queen-jack or better.
    expect(meetsStandard(evaluate(parseHand("K85432.J3.A64.93")), "S", "hcp3")).toBe(true);
    expect(meetsStandard(evaluate(parseHand("Q85432.J3.A64.93")), "S", "hcp3")).toBe(false);
    expect(meetsStandard(evaluate(parseHand("QJ5432.J3.A64.93")), "S", "hcp3")).toBe(true);
  });
});
