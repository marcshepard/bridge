import { describe, expect, it } from "vitest";
import { parseHand } from "../core/deal";
import { SUITS } from "../core/types";
import { type SetDefinition, dealSet, ewLayouts, handsOf, hasClearBid } from "./deals";
import { type ContractOption, contractClass, contractOptions, encodeTricks, expectedLoss, missKind, optionFor, tricksOf } from "./ideal";
import { type RunFile, bootstrapCi, compareLosses, slamsByHcp } from "./report";
import { type BoardResult, silentAuction, situationTags } from "./stage1";

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
