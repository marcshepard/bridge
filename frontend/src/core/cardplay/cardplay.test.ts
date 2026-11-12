import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCall } from "../auction";
import { botAuction } from "../bidding/bidder";
import { SAYC_DEFAULTS } from "../bidding/system";
import { auctionResult } from "../auction";
import { parseHand } from "../deal";
import { type PlayState, cardCode, isComplete, playCard, startPlay, tricksWon } from "../play";
import { parseGameFile } from "../../providers/gameFile";
import { SyncSolver } from "../../dds/syncSolver";
import { leadCard } from "./carding";
import { playContext } from "./context";
import { type CardGroup, AK_LEAD_MARGIN, akLeads, decideCard } from "./decide";
import { botClaim, checkClaim } from "./claims";
import { type CardOdds, markFor, oddsOf, reviewCard } from "./review";
import type { CardSimulation } from "./decide";
import { fitWeight, sampleDeals, voids } from "./sample";
import { unknownHand } from "../bidding/model";
import { seeded } from "../random";

const solver = new SyncSolver();

describe("leads", () => {
  it.each([
    ["KQJ5", "K", "the top of a sequence"],
    ["QJT3", "Q", "the top of a sequence"],
    ["KJT4", "J", "an interior sequence"],
    ["AK52", "A", "A from AK"],
    ["Q1083", "3", "fourth best"],
    ["K73", "3", "low from three to an honour"],
    ["872", "8", "top of three small"],
    ["93", "9", "top of a doubleton"],
  ])("from %s: %s (%s)", (ranks, card) => {
    expect(leadCard(ranks.replace("10", "T"), SAYC_DEFAULTS).rank).toBe(card);
  });

  it("follows your agreements: K from AK, third and fifth", () => {
    expect(leadCard("AK52", { ...SAYC_DEFAULTS, leadFromAk: "K" }).rank).toBe("K");
    expect(leadCard("QT83", { ...SAYC_DEFAULTS, lengthLeads: "thirdFifth" }).rank).toBe("8"); // third from four
    expect(leadCard("QT832", { ...SAYC_DEFAULTS, lengthLeads: "thirdFifth" }).rank).toBe("2"); // lowest from five
  });
});

describe("dealing the hidden hands", () => {
  const hands = {
    N: parseHand("73.T7.T63.QJT943"),
    E: parseHand("K542.KQJ854..AK2"),
    S: parseHand("QJT98.62.AK94.85"),
    W: parseHand("A6.A93.QJ8752.76"),
  };

  it("keeps each hidden hand's size, its voids, and the visible cards where they are", () => {
    // 4♥ by East: a club trick and a heart trick, then it's North's turn to think.
    let state: PlayState = startPlay(hands, "H", "E");
    for (const c of ["C8", "C7", "CQ", "CA"]) state = playCard(state, { suit: c[0] as "C", rank: c[1]! });
    for (const c of ["H4", "H2", "H3", "HT"]) state = playCard(state, { suit: c[0] as "H", rank: c[1]! });
    const deals = sampleDeals(state, "N", { N: unknownHand(), E: unknownHand(), S: unknownHand(), W: unknownHand() }, 20, 5000, seeded(1));
    expect(deals.length).toBe(20);
    for (const d of deals) {
      expect(d.hands.N).toEqual(state.hands.N); // its own
      expect(d.hands.W).toEqual(state.hands.W); // dummy, face up
      expect(Object.values(d.hands.E).join("").length).toBe(Object.values(state.hands.E).join("").length);
    }
    expect(voids(state).E.size).toBe(0);
  });

  it("weights near misses of the bidding a third, and leaves out the rest", () => {
    const shown = { ...unknownHand(), hcp: [12, 14] as [number, number] };
    const cards = (h: string) => Object.entries(parseHand(h)).flatMap(([suit, ranks]) => [...ranks].map((rank) => ({ suit: suit as "S", rank })));
    expect(fitWeight(cards("AK3.QJ2.K52.8643"), shown)).toBe(1); // 13 HCP
    expect(fitWeight(cards("AK3.432.K52.8643"), shown)).toBeCloseTo(1 / 3); // 10 HCP: two light
    expect(fitWeight(cards("A43.Q32.952.8643"), shown)).toBe(0); // 6 HCP
  });

  it("weights a suit weaker than the bidding showed (an overcall) a third", () => {
    const shown = { ...unknownHand(), quality: { H: "decent" as const } };
    const cards = (h: string) => Object.entries(parseHand(h)).flatMap(([suit, ranks]) => [...ranks].map((rank) => ({ suit: suit as "S", rank })));
    expect(fitWeight(cards("A43.KJ852.95.864"), shown)).toBe(1);
    expect(fitWeight(cards("A43.98752.K5.864"), shown)).toBeCloseTo(1 / 3);
  });
});

describe("the bots' card play", () => {
  it("plays a whole board sensibly: close to the double-dummy result", async () => {
    const game = parseGameFile(JSON.parse(readFileSync(new URL("../../../../backend/src/demo/demo-game.json", import.meta.url), "utf8")));
    const board = game.boards.find((b) => b.number === 1)!;
    const deal = { dealer: board.dealer, vul: board.vul };
    const calls = botAuction(board.hands, deal).map((d) => d.call);
    const end = auctionResult(board.dealer, calls)!;
    const ctx = playContext(deal, calls);
    let state = startPlay(board.hands, end.contract!.strain, end.declarer!);
    const start = performance.now();
    while (!isComplete(state)) state = playCard(state, (await decideCard(state, ctx, solver, { deals: 24 })).card);
    const dd = board.doubleDummy!.tricks![end.declarer!][end.contract!.strain];
    expect(Math.abs(tricksWon(state).declarer - dd)).toBeLessThanOrEqual(1);
    console.log(`board 1: ${end.contract!.level}${end.contract!.strain} by ${end.declarer}, ${tricksWon(state).declarer} tricks (double dummy ${dd}), ${Math.round(performance.now() - start)} ms`);
  }, 120_000);

  it("explains its card", async () => {
    const hands = {
      N: parseHand("73.T7.T63.QJT943"),
      E: parseHand("K542.KQJ854..AK2"),
      S: parseHand("QJT98.62.AK94.85"),
      W: parseHand("A6.A93.QJ8752.76"),
    };
    const ctx = playContext({ dealer: "N", vul: "None" }, ["PASS", "1H", "1S", "2S", "PASS", "4H", "PASS", "PASS", "PASS"].map((c) => parseCall(c)!));
    const lead = await decideCard(startPlay(hands, "H", "E"), ctx, solver, { deals: 24 });
    expect(lead.reason).toMatch(/deals that fit what it knows/);
    expect(lead.simulation!.groups.length).toBeGreaterThan(1);
    expect(cardCode(lead.card)).toMatch(/^[SHDC][AKQJT2-9]$/);
  });
});

describe("the play review", () => {
  const card = (code: string) => ({ suit: code[0] as "S", rank: code[1]! });
  const odds = (gap: number, clear = true) => ({ gap, clear }) as CardOdds;

  it.each([
    ["the best play that didn't cost", 0, 0, null, false],
    ["the best play that cost a trick: unlucky", 0, 1, "unlucky", false],
    ["10% behind: a mistake, even when it worked", 0.1, 0, "mistake", false],
    ["5% behind, clearly: a close call", 0.05, 1, "close", false],
    ["5% behind, within the noise: too close to call", 0.05, 0, null, true],
    ["half a percent behind: too close to call", 0.005, 0, null, true],
  ] as const)("%s", (_, gap, cost, mark, tooClose) => {
    const clear = !(gap === 0.05 && cost === 0);
    expect(markFor(gap === 0 ? null : odds(gap, clear), cost)).toEqual({ mark, tooClose });
  });

  it("compares the two cards on the same deals, and says when the gap is clear", () => {
    // ♠A best on every deal; ♠2 best on 3 of 4 (the same deals): 25% behind, but on 4 deals not clear.
    const rows = [
      [["SA", 3], ["S2", 3]],
      [["SA", 3], ["S2", 3]],
      [["SA", 3], ["S2", 3]],
      [["SA", 3], ["S2", 2]],
    ].map((r) => new Map(r as [string, number][]));
    const sim: CardSimulation = {
      deals: rows.map(() => ({ hands: {} as never, weight: 1 })),
      total: 4,
      perDeal: rows,
      groups: [
        { cards: [card("SA")], best: 1, average: 3 },
        { cards: [card("S2")], best: 0.75, average: 2.75 },
      ],
      note: "",
    };
    const o = oddsOf(sim, card("S2"))!;
    expect(o.gap).toBeCloseTo(0.25);
    expect(o.clear).toBe(false);
    // The same pattern on 40 deals is clear.
    const many = { ...sim, deals: Array.from({ length: 40 }, () => ({ hands: {} as never, weight: 1 })), total: 40, perDeal: Array.from({ length: 10 }, () => rows).flat() };
    expect(oddsOf(many, card("S2"))!.clear).toBe(true);
    expect(oddsOf(sim, card("SA"))!.gap).toBe(0);
  });

  it("never marks the bot's own card, and marks a lead well behind the best as a mistake", async () => {
    const hands = {
      N: parseHand("73.T7.T63.QJT943"),
      E: parseHand("K542.KQJ854..AK2"),
      S: parseHand("QJT98.62.AK94.85"),
      W: parseHand("A6.A93.QJ8752.76"),
    };
    const ctx = playContext({ dealer: "N", vul: "None" }, ["PASS", "1H", "1S", "2S", "PASS", "4H", "PASS", "PASS", "PASS"].map((c) => parseCall(c)!));
    const state = startPlay(hands, "H", "E");
    const bots = await reviewCard(state, (await decideCard(state, ctx, solver)).card, ctx, solver, true);
    expect(bots.mark === null || bots.mark === "unlucky").toBe(true);
    expect(bots.odds!.gap).toBe(0);
    const groups = bots.odds!.groups;
    const worst = groups.at(-1)!;
    if (groups[0]!.best - worst.best >= 0.1) {
      const r = await reviewCard(state, worst.cards[0]!, ctx, solver, true);
      expect(r.mark).toBe("mistake");
      expect(r.bot.card).toEqual(bots.bot.card);
    }
    expect(bots.actual.length).toBeGreaterThan(1);
  }, 60_000);
});

describe("claims", () => {
  // Two-card endings in notrump, North declaring and on lead. The 11 tricks before are filled with
  // the rest of the deck, four of a suit each, so nobody has shown out of anything.
  function ending(hands: Record<"N" | "E" | "S" | "W", string>): PlayState {
    const held = new Set(Object.values(hands).flatMap((h) => h.split(" ")));
    const rest: string[] = [];
    for (const s of "SHDC") for (const r of "AKQJT98765432") if (!held.has(s + r)) rest.push(s + r);
    const order = ["N", "E", "S", "W"] as const;
    const tricks = Array.from({ length: 11 }, (_, t) => ({
      leader: "N" as const,
      cards: rest.slice(t * 4, t * 4 + 4).map((c, i) => ({ seat: order[i]!, card: { suit: c[0] as "S", rank: c[1]! } })),
    }));
    const toHand = (cards: string) => {
      const h = { S: "", H: "", D: "", C: "" };
      for (const c of cards.split(" ")) h[c[0] as "S"] += c[1];
      return h;
    };
    return {
      hands: { N: toHand(hands.N), E: toHand(hands.E), S: toHand(hands.S), W: toHand(hands.W) },
      trump: "NT",
      declarer: "N",
      tricks: [...tricks, { leader: "N", cards: [] }],
    };
  }
  const ctx = { ...playContext({ dealer: "N", vul: "None" }, []), key: "test" };

  it("a bot declarer claims when its side's tricks are certain", async () => {
    const state = ending({ N: "SA SK", E: "SQ SJ", S: "S2 HA", W: "DA CA" });
    expect(await botClaim(state, ctx, solver)).toBe(2);
  });

  it("a bot defender refuses a claim that fails, and accepts one that holds", async () => {
    // North has ♠A3 and no way to dummy's ♥A: only one trick.
    const state = ending({ N: "SA S3", E: "SK SQ", S: "S2 HA", W: "DA CA" });
    expect((await checkClaim(state, { seat: "N", tricks: 2, acceptedBy: [] }, "E", ctx, solver)).accept).toBe(false);
    expect((await checkClaim(state, { seat: "N", tricks: 1, acceptedBy: [] }, "E", ctx, solver)).accept).toBe(true);
  });
});

describe("reading leads and signals", () => {
  // 3NT by South; West leads, so East (West's partner) reads the lead. North is dummy.
  const hands = {
    N: parseHand("AQ4.K43.AJ2.T987"),
    E: parseHand("98.QJ92.T9876.A2"),
    S: parseHand("T62.A87.KQ5.KQJ3"),
    W: parseHand("KJ753.T65.43.654"),
  };
  const read = (lead: string) => {
    let state = startPlay(hands, "NT", "S");
    state = playCard(state, { suit: "S", rank: lead }); // West's lead
    state = playCard(state, { suit: "S", rank: "4" }); // dummy plays low; East to think
    return sampleDeals(state, "E", { N: unknownHand(), E: unknownHand(), S: unknownHand(), W: unknownHand() }, 60, 20_000, seeded(3), [], () => SAYC_DEFAULTS);
  };

  it("fourth best: the deals that count in full give the leader three higher spades", () => {
    const deals = read("5");
    const full = deals.filter((d) => d.weight === 1);
    expect(full.length).toBeGreaterThan(5);
    for (const d of full) expect([...(d.hands.W.S + "5")].filter((r) => "AKQJT9876".indexOf(r) >= 0 && "AKQJT98765432".indexOf(r) < "AKQJT98765432".indexOf("5")).length).toBe(3);
    // Deals that don't fit partner's lead count a tenth.
    expect(deals.some((d) => d.weight < 0.2)).toBe(true);
  });

  it("is ignored when no agreements are given (the cards played still count)", () => {
    let state = startPlay(hands, "NT", "S");
    state = playCard(state, { suit: "S", rank: "5" });
    state = playCard(state, { suit: "S", rank: "4" });
    const deals = sampleDeals(state, "E", { N: unknownHand(), E: unknownHand(), S: unknownHand(), W: unknownHand() }, 30, 20_000, seeded(3));
    expect(deals.every((d) => d.weight === 1)).toBe(true);
  });
});

describe("the opening lead from AK", () => {
  // South declares 4♠; West is on lead with ♥AK852.
  const hands = {
    N: parseHand("KQ9.QJ4.AJ7.8642"),
    E: parseHand("J2.T963.Q985.AT7"),
    S: parseHand("AT8654.7.K32.KQ5"),
    W: parseHand("73.AK852.T64.J93"),
  };
  const card = (c: string) => ({ suit: c[0] as "S", rank: c[1]! });
  const groups = (ak: number): CardGroup[] => [
    { cards: [card("C3")], best: 0.6, average: 3 },
    { cards: [card("HA"), card("HK")], best: ak, average: 3 },
  ];

  it("is preferred against a suit contract unless another lead is clearly better", () => {
    const state = startPlay(hands, "S", "S");
    expect(akLeads(state, groups(0.6 - AK_LEAD_MARGIN + 0.01)).map((a) => a.suit)).toEqual(["H"]);
    expect(akLeads(state, groups(0.6 - AK_LEAD_MARGIN - 0.05))).toEqual([]);
  });

  it("isn't preferred against notrump, or from AK of trumps", () => {
    expect(akLeads(startPlay(hands, "NT", "S"), groups(0.55))).toEqual([]);
    expect(akLeads(startPlay(hands, "H", "S"), groups(0.55))).toEqual([]);
  });

  it("the bot leads from AK, and says why", async () => {
    const deal = { dealer: "S" as const, vul: "None" as const };
    const ctx = playContext(deal, "1S PASS 2S PASS 4S PASS PASS PASS".split(" ").map((c) => parseCall(c)!));
    const decision = await decideCard(startPlay(hands, "S", "S"), ctx, solver);
    expect(["HA", "HK"]).toContain(cardCode(decision.card));
  }, 60_000);
});
