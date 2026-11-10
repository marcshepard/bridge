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
import { decideCard } from "./decide";
import { botClaim, checkClaim } from "./claims";
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
