import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Call, auctionResult, callCode, canCall, isAuctionOver, parseCall } from "../auction";
import { parseHand } from "../deal";
import type { Seat, Vulnerability } from "../types";
import { parseGameFile } from "../../providers/gameFile";
import { botAuction, chooseCall, readAuction, reviewAuction } from "./bidder";
import { type SystemSettings, describeSettings, isDefault, parseSystemSettings, SAYC_DEFAULTS } from "./system";
import { evaluate, fitPoints, suitTricks } from "./evaluate";

/** An auction written the way it's stored: "1H PASS 2H". */
const calls = (text: string): Call[] => text.split(" ").filter(Boolean).map((t) => parseCall(t)!);

/** The bot's call, as a code, for a hand ("AKQ2.JT9.876.543") after an auction, dealer first. */
function bot(hand: string, auction = "", dealer: Seat = "N", vul: Vulnerability = "None"): string {
  return callCode(chooseCall(parseHand(hand), { dealer, vul }, calls(auction)).call);
}

describe("openings", () => {
  it.each([
    ["1NT: 15–17 balanced", "AQ4.KJ3.Q976.K82", "1NT"],
    ["1NT with a five-card major", "AQ.KJ932.Q97.K82", "1NT"],
    ["2NT: 20–21 balanced", "AK84.KJ3.AQ7.K82", "2NT"],
    ["strong 2♣", "AKQJ4.AKQ3.A7.K2", "2C"],
    ["1♠ with five spades", "AKJ54.K32.Q7.982", "1S"],
    ["the higher of two five-card suits", "AKJ54.KQ932.7.82", "1S"],
    ["1♦ with 4-4 in the minors", "AK4.Q32.K874.Q82", "1D"],
    ["1♣ with 3-3 in the minors", "AK42.Q73.K87.Q82", "1C"],
    ["weak two in hearts", "84.KQJ984.73.982", "2H"],
    ["three-level preempt", "84.3.KQJ9842.982", "3D"],
    ["pass with 9 HCP", "K842.Q73.J87.Q82", "PASS"],
  ])("%s", (_, hand, expected) => {
    expect(bot(hand)).toBe(expected);
  });

  it("opens light by the rule of 20 in first seat", () => {
    expect(bot("AQ984.KJ873.3.82")).toBe("1S"); // 10 HCP + 5 + 5
  });

  it("passes out in fourth seat without the rule of 15", () => {
    expect(bot("2.KQ873.AJ3.Q982", "PASS PASS PASS")).toBe("PASS"); // 12 HCP + 1 spade = 13
  });
});

describe("responses", () => {
  it.each([
    ["single raise of a major", "K84.Q73.J987.Q82", "1H PASS", "2H"],
    ["single raise with three trumps and shortness, under 10 HCP", "K84.Q73.KJ8732.2", "1H PASS", "2H"],
    ["limit raise with four trumps", "K84.Q732.A98.J82", "1H PASS", "3H"],
    ["three trumps and 10–12: a new suit first, not a limit raise", "K84.Q73.A987.Q82", "1H PASS", "2D"],
    ["three trumps and a 10 HCP hand with four diamonds", "K84.732.AQ98.J83", "1S PASS", "2D"],
    ["weak raise to game with five trumps, no shortness", "Q8732.84.J98.Q82", "1S PASS", "4S"],
    ["three trumps, 13+, no 4-card suit: 2♣ on three", "K84.KQ32.A98.J82", "1S PASS", "2C"],
    ["Jacoby 2NT with four trumps and opening values", "K84.Q732.A98.KQ2", "1H PASS", "2NT"],
    ["new suit at the one level", "KJ84.73.Q987.Q82", "1H PASS", "1S"],
    ["1NT with nothing better", "84.K73.Q987.Q862", "1S PASS", "1NT"],
    ["two over one with 10+", "84.73.AQ987.KQ82", "1S PASS", "2D"],
    ["a major before diamonds over 1♣ when weak", "KJ84.73.Q9876.82", "1C PASS", "1S"],
    ["pass with fewer than 6 points", "984.73.Q9876.J82", "1H PASS", "PASS"],
  ])("%s", (_, hand, auction, expected) => {
    expect(bot(hand, auction)).toBe(expected);
  });
});

describe("hand valuation", () => {
  it.each([
    ["5-3-3-2, five shown", "AQ932.K54.K85.94", 5, 13],
    ["6-3-2-2, five shown: the sixth trump counts", "AQ9832.K54.K5.94", 5, 15],
    ["6-3-2-2, six shown", "AQ9832.K54.K5.94", 6, 14],
    ["5-4-3-1: a singleton is 2", "AQ932.K543.K85.9", 5, 14],
  ])("points after a fit, %s", (_, hand, shown, points) => {
    expect(fitPoints(evaluate(parseHand(hand)), "S", shown)).toBe(points);
  });

  it.each([
    ["AKQJ987", 7],
    ["KQJT98", 5],
    ["AKQJT98765432", 13],
    ["K542", 0], // a short side suit: only sure winners count
    ["AK2", 2],
    ["KQ", 1],
  ])("playing tricks in %s: %i", (ranks, tricks) => {
    expect(suitTricks(ranks)).toBe(tricks);
  });

  it("counts length points from the start, and shortness separately for once there's a fit", () => {
    const hand = evaluate(parseHand("AKQ32.KJ32.Q32.")); // 15 HCP, a five-card suit, a void
    expect(hand.points).toBe(16);
    expect(hand.shortnessPoints).toBe(3);
  });

  it("opens 2♣ with nine playing tricks, however few the HCP", () => {
    expect(bot("AKQJT98765432...")).toBe("2C");
    expect(bot("AKQJT987.A.A32.32")).toBe("2C"); // 8 + 1 + 1 tricks, 17 HCP
  });

  it("bids the grand slam its own tricks make", () => {
    expect(bot("AKQJT98765432...", "2C PASS 2D PASS")).toBe("7S");
  });

  // East counts 16 HCP + 3 for the void + 1 for the sixth heart = 20, and partner's cuebid raise
  // about 12: 32, slam possible but not sure. East invites with 5♥; West, with 13 (more than the
  // 12 or so shown), accepts.
  it("finds the slam on demo board 1 with a slam invitation", () => {
    const hands = {
      N: parseHand("73.T7.T63.QJT943"),
      E: parseHand("K542.KQJ854..AK2"),
      S: parseHand("QJT98.62.AK94.85"),
      W: parseHand("A6.A93.QJ8752.76"),
    };
    const made = botAuction(hands, { dealer: "N", vul: "None" }).map((d) => d.call);
    expect(made.map(callCode).slice(5, 8)).toEqual(["5H", "PASS", "6H"]);
    expect(auctionResult("N", made)?.contract).toMatchObject({ level: 6, strain: "H" });
  });

  it("when outbid past its target, makes a hard call instead of bidding on", () => {
    // North opens 1♠, partner raises; they bid to 5♥ over our 4♠.
    const d = chooseCall(parseHand("AKJ84.32.KQ4.Q32"), { dealer: "N", vul: "None" }, calls("1S 2H 2S 4H 4S 5H PASS PASS"));
    expect(d.hard).not.toBeNull();
    expect(d.call.kind).not.toBe("bid");
  });
});

describe("over their 1NT", () => {
  it.each([
    ["balancing: a long suit overcalls rather than doubling (board 5)", "KJ8.7.K7.AKT9762", "1NT PASS PASS", "2C"],
    ["double: 15 HCP and balanced", "KJ8.Q72.K73.AQ62", "1NT", "X"],
    ["double: 15 HCP and balanced, balancing seat too (no points off)", "KJ8.Q72.K73.AQ62", "1NT PASS PASS", "X"],
    ["15 HCP with a six-card suit overcalls", "K8.Q7.K73.AQJ762", "1NT", "2C"],
    ["17 HCP with a six-card suit: too strong to overcall, so double", "K8.A7.K73.AQJ762", "1NT", "X"],
    ["balancing: a good five-card suit overcalls", "AKJ82.73.T64.952", "1NT PASS PASS", "2S"],
    ["direct seat: a five-card suit doesn't", "AKJ82.73.T64.952", "1NT", "PASS"],
  ])("%s", (_, hand, auction, expected) => {
    expect(bot(hand, auction)).toBe(expected);
  });
});

describe("direct seat over their 1NT: five-card suits", () => {
  const S = "S" as const;
  it.each([
    ["two 5-card suits: the higher-ranking (board 3)", "J32.AT753.AQJ92.", "EW", "2H"],
    ["two 5-card suits with 8 HCP", "J32.KT753.KJ932.", "EW", "2H"],
    ["a good 5-card suit, not vulnerable", "J32.AKT75.Q92.K3", "None", "2H"],
    ["a good 5-card suit, vulnerable: pass", "J32.AKT75.Q92.K3", "EW", "PASS"],
    ["a good 5-card suit with under 10 HCP: pass", "J32.AKT75.932.43", "None", "PASS"],
  ])("%s", (_, hand, vul, expected) => {
    expect(bot(hand, "PASS PASS 1NT", S, vul as Vulnerability)).toBe(expected);
  });

  it.each([
    ["two suits: pass or either suit", "J32.AT753.AQJ92.", "EW", ["PASS", "2H", "2D"]],
    ["a good five, not vulnerable", "J32.AKT75.Q92.K3", "None", ["PASS", "2H"]],
    ["a good five, vulnerable", "J32.AKT75.Q92.K3", "EW", ["PASS", "2H"]],
  ])("hard call: %s", (_, hand, vul, candidates) => {
    const d = chooseCall(parseHand(hand), { dealer: S, vul: vul as Vulnerability }, calls("PASS PASS 1NT"));
    expect(d.hard?.candidates.map(callCode)).toEqual(candidates);
  });

  it("partner reads a direct overcall of 1NT as 5+ cards", () => {
    const steps = readAuction({ dealer: S, vul: "EW" }, calls("PASS PASS 1NT 2H"));
    expect(steps.at(-1)!.position.shown.E.len.H[0]).toBe(5);
  });
});

describe("partner opened and they overcalled 1NT", () => {
  const W = "W" as const;
  it.each([
    ["a long suit with shortness in partner's suit bids it (board 4)", "4.QT865.J8.KT972", "2H"],
    ["8 HCP doubles", "4.KQ865.J83.K972", "X"],
    ["10 HCP doubles", "4.KQ865.Q83.K972", "X"],
    ["two cards in partner's suit: defends", "42.QT865.J83.K97", "PASS"],
  ])("%s", (_, hand, expected) => {
    expect(bot(hand, "PASS 1S 1NT", W, "Both")).toBe(expected);
  });

  it.each([
    ["the new suit", "4.QT865.J8.KT972", ["PASS", "2H"]],
    ["a double with 8–9", "4.KQ865.J83.K972", ["PASS", "X"]],
    ["but not a double with 10+", "4.KQ865.Q83.K972", null],
  ])("hard call: %s", (_, hand, candidates) => {
    const d = chooseCall(parseHand(hand), { dealer: W, vul: "Both" }, calls("PASS 1S 1NT"));
    expect(d.hard?.candidates.map(callCode) ?? null).toEqual(candidates);
  });

  it("reads the new suit as weak with 5+ cards, and the double as 8+", () => {
    const shownAfter = (a: string) => readAuction({ dealer: W, vul: "Both" }, calls(a)).at(-1)!.position.shown.S;
    expect(shownAfter("PASS 1S 1NT 2H").hcp).toEqual([0, 7]);
    expect(shownAfter("PASS 1S 1NT 2H").len.H[0]).toBe(5);
    expect(shownAfter("PASS 1S 1NT X").hcp[0]).toBe(8);
  });
});

describe("after partner's penalty double of 1NT", () => {
  it.each([
    ["runs with 4 HCP and six hearts (board 5)", "T643.Q98532.Q3.5", "1NT PASS PASS X PASS", "2H"],
    ["runs to the higher of two five-card suits", "T6432.J9853.43.5", "1NT X PASS", "2S"],
    ["defends with 6 HCP", "T643.Q98532.K3.J", "1NT PASS PASS X PASS", "PASS"],
    ["defends with no five-card suit", "T643.Q983.Q32.54", "1NT PASS PASS X PASS", "PASS"],
  ])("%s", (_, hand, auction, expected) => {
    expect(bot(hand, auction)).toBe(expected);
  });

  it("makes running a hard call, so simulation can decide it", () => {
    const d = chooseCall(parseHand("T643.Q98532.Q3.5"), { dealer: "N", vul: "NS" }, calls("1NT PASS PASS X PASS"));
    expect(d.hard?.candidates.map(callCode)).toEqual(["PASS", "2H"]);
  });

  it("reads the run-out as 0–5 HCP and 5+ cards", () => {
    const steps = readAuction({ dealer: "N", vul: "None" }, calls("1NT PASS PASS X PASS 2H"));
    const shown = steps.at(-1)!.position.shown.E;
    expect(shown.hcp).toEqual([0, 5]);
    expect(shown.len.H[0]).toBe(5);
  });
});

describe("slam", () => {
  const N = "N" as const;
  const card = (blackwood: SystemSettings["blackwood"]): SystemSettings => ({ ...SAYC_DEFAULTS, blackwood });
  const call = (hand: string, auction: string, settings: SystemSettings = SAYC_DEFAULTS) =>
    callCode(chooseCall(parseHand(hand), { dealer: N, vul: "None" }, calls(auction), settings).call);

  // East after 1♥ (1♠) 2♠ cuebid raise: likely 31–32 invites; a suit with two quick losers doesn't.
  it.each([
    ["invites with 5♥ (board 1)", "K542.KQJ854..AK2", "5H"],
    ["bids game instead with two quick losers in clubs", "K542.AKJ854.A.32", "4H"],
  ])("slam invitation: %s", (_, hand, expected) => {
    expect(call(hand, "PASS 1H 1S 2S PASS")).toBe(expected);
  });

  it.each([
    ["accepts with more than shown", "A6.A93.QJ8752.76", "6H"],
    ["declines with no more than shown", "A6.J93.QJ8752.76", "PASS"],
  ])("answering 5♥: %s", (_, hand, expected) => {
    expect(call(hand, "PASS 1H 1S 2S PASS 5H PASS")).toBe(expected);
  });

  it("reads 5 of our agreed major as a slam invitation", () => {
    expect(readAuction({ dealer: N, vul: "None" }, calls("PASS 1H 1S 2S PASS 5H"))[5]!.read!.rule?.name).toBe("Slam invitation");
  });

  // Roman Key Card: hearts agreed by 1♥–3♥, then 4NT.
  it.each([
    ["plain: aces only", "plain", "A84.K732.987.Q82", "5D"],
    ["1430: two key cards without the queen", "rkc1430", "A84.K732.987.Q82", "5H"],
    ["1430: two key cards with the queen", "rkc1430", "A84.KQ32.987.982", "5S"],
    ["1430: one key card is 5♣", "rkc1430", "A84.J732.987.Q82", "5C"],
    ["3014: one key card is 5♦", "rkc3014", "A84.J732.987.Q82", "5D"],
    ["3014: none is 5♣", "rkc3014", "Q84.J732.K87.Q82", "5C"],
  ])("answers 4NT, %s", (_, style, hand, expected) => {
    expect(call(hand, "1H PASS 3H PASS 4NT PASS", card(style as SystemSettings["blackwood"]))).toBe(expected);
  });

  it.each([
    ["two missing (partner has 1, not 4): signs off", "KQ2.AQJ85.AKQ.32", "5C", "5H"],
    ["one missing, holding the queen: small slam", "A2.AQJ85.AKQ.432", "5C", "6H"],
    ["one missing, queen unknown: asks for it with 5♦", "A2.AJ985.AKQ.432", "5C", "5D"],
  ])("after a 1430 answer: %s", (_, hand, answer, expected) => {
    expect(call(hand, `1H PASS 3H PASS 4NT PASS ${answer} PASS`, card("rkc1430"))).toBe(expected);
  });

  it.each([
    ["with the queen: six", "A84.KQ32.987.982", "6H"],
    ["without it: five", "A84.K732.987.Q82", "5H"],
  ])("answers the queen ask %s", (_, hand, expected) => {
    expect(call(hand, "1H PASS 3H PASS 4NT PASS 5C PASS 5D PASS", card("rkc1430"))).toBe(expected);
  });

  it("leaves partner's decision alone after answering", () => {
    expect(call("A84.J732.987.Q82", "1H PASS 3H PASS 4NT PASS 5C PASS 5H PASS", card("rkc1430"))).toBe("PASS");
  });
});

describe("responder's second bid", () => {
  it("shows a four-card suit at the one level (natural, not fourth suit forcing)", () => {
    // 1♣–1♦–1♥: responder holds four spades and 12 HCP.
    expect(bot("J872.K.AQT8.Q432", "1C PASS 1D PASS 1H PASS")).toBe("1S");
  });

  it("passes partner's 3NT saying game is bid, not that it's too high", () => {
    const d = chooseCall(parseHand("J872.K.AQT8.Q432"), { dealer: "N", vul: "None" }, calls("1C PASS 1D PASS 1H PASS 1S PASS 3NT PASS"));
    expect(callCode(d.call)).toBe("PASS");
    expect(d.reason).toMatch(/game is bid/);
  });

  it("raises opener's major rather than showing spades with four of each", () => {
    expect(bot("J872.KQ73.AQT8.4", "1C PASS 1D PASS 1H PASS")).not.toBe("1S");
  });

  // Three trumps and 10–12: a new suit first, then the invitation.
  it.each([
    ["invites with 10 after opener rebids the major", "K84.732.AQ98.J83", "1S PASS 2D PASS 2S PASS", "3S"],
    ["jumps back to invite after opener shows hearts", "K84.732.AQ98.J83", "1S PASS 2D PASS 2H PASS", "3S"],
    ["bids game with 13", "K84.KQ32.A98.J82", "1S PASS 2C PASS 2S PASS", "4S"],
  ])("%s", (_, hand, auction, expected) => {
    expect(bot(hand, auction)).toBe(expected);
  });

  it("reads the delayed invitation as 10–12 with 3+ trumps", () => {
    const steps = readAuction({ dealer: "N", vul: "None" }, calls("1S PASS 2D PASS 2S PASS 3S PASS"));
    const shown = steps.at(-1)!.position.shown.S;
    expect(shown.hcp).toEqual([10, 12]);
    expect(shown.len.S[0]).toBe(3);
  });
});

describe("placing the contract: game and invitation points", () => {
  it("invites game in a minor with 25–27 (demo board 36)", () => {
    // 1♥–2♦–3♦–(X): 14 points here with partner's likely 13 is 27, short of the 28 a minor game needs.
    expect(bot("T65.5.AK873.QJT8", "PASS 1H PASS 2D PASS 3D X", "W", "Both")).toBe("4D");
  });
});

describe("opener after the delayed invitation (1♠–2♦–2♠–3♠)", () => {
  it.each([
    ["accepts with extras", "AQJ32.K54.K5.Q94", "4S"],
    ["declines with 12 HCP, 5-3-2-3 (12 + 1 for the doubleton)", "AQ932.K54.85.K94", "PASS"],
    ["declines with 12 HCP, 6-3-2-2: 14 (the sixth spade was shown) + about 11 is short of 26", "AQ9832.K54.K5.94", "PASS"],
  ])("%s", (_, hand, expected) => {
    expect(bot(hand, "1S PASS 2D PASS 2S PASS 3S PASS")).toBe(expected);
  });
});

describe("opener after a limit raise (1♠–3♠): the same count as the delayed invitation", () => {
  it.each([
    ["declines with 12 HCP, 5-3-3-2 (12 + 1 for the doubleton)", "AQ932.K54.K85.94", "PASS"],
    ["declines with 14 (13 HCP + 1): a major game needs 15 opposite the raise", "AQ932.K54.K85.J4", "PASS"],
    ["accepts with 12 HCP, 6-3-2-2 (12 + 2 for the doubletons + 1 for the sixth spade)", "AQ9832.K54.K5.94", "4S"],
  ])("%s", (_, hand, expected) => {
    expect(bot(hand, "1S PASS 3S PASS")).toBe(expected);
  });
});

describe("what a response shows partner", () => {
  it("2♣ over 1♠ promises only three clubs (it can be the last resort)", () => {
    const steps = readAuction({ dealer: "N", vul: "None" }, calls("1S PASS 2C"));
    expect(steps.at(-1)!.position.shown.S.len.C[0]).toBe(3);
  });

  it("the weak raise to game still shows 3+ HCP", () => {
    const steps = readAuction({ dealer: "N", vul: "None" }, calls("1S PASS 4S"));
    expect(steps.at(-1)!.position.shown.S.hcp).toEqual([3, 9]);
  });
});

describe("after a jump shift (19+, forcing to game)", () => {
  const deal = { dealer: "W", vul: "EW" } as const;

  it("explains opener's rebid of the suit as shape, not strength", () => {
    const steps = readAuction(deal, calls("1D PASS 3C PASS 3D"));
    const meaning = steps[4]!.read!.meaning;
    expect(meaning).toMatch(/Game is already forced/);
    expect(meaning).not.toMatch(/16–18/);
  });

  it("reads a direct 3NT as no extras: the bottom of the range", () => {
    const steps = readAuction(deal, calls("1D PASS 3C PASS 3D PASS 3NT"));
    expect(steps.at(-1)!.position.shown.E.hcp).toEqual([19, 20]);
    expect(steps[6]!.read!.meaning).toMatch(/no extra strength/);
  });

  it("bids the small slam, not the grand, on demo board 16", () => {
    const hands = {
      N: parseHand("9642.J72.T932.J5"),
      E: parseHand("A73.AQ83.A.AKT86"),
      S: parseHand("JT85.T95.Q5.9432"),
      W: parseHand("KQ.K64.KJ8764.Q7"),
    };
    const made = botAuction(hands, deal).map((d) => d.call);
    expect(auctionResult("W", made)?.contract).toMatchObject({ level: 6, strain: "NT" });
  });
});

describe("after 1♣–2NT (13–15, forcing to game)", () => {
  // Marc's board: South opens 1♣ with 17 HCP and seven clubs headed by the AK; North bids 2NT.
  const south = "Q6.8.AKJ.AKT9852";
  const north = "K72.AKQ.95.J7643";

  it("opener bids the slam with a running suit and 33+ between us", () => {
    const d = chooseCall(parseHand(south), { dealer: "S", vul: "NS" }, calls("1C PASS 2NT PASS"));
    expect(callCode(d.call)).toBe("6NT");
    expect(d.reason).toMatch(/should run/);
  });

  it("the bots reach slam on Marc's board", () => {
    const hands = { N: parseHand(north), E: parseHand("AJT3.J9543.T863."), S: parseHand(south), W: parseHand("9854.T762.Q742.Q") };
    const made = botAuction(hands, { dealer: "S", vul: "NS" }).map((d) => d.call);
    expect(auctionResult("S", made)?.contract?.level).toBeGreaterThanOrEqual(6);
  });

  it.each([
    ["opener: 3NT with a balanced minimum", "K84.Q73.AJ7.KJ82", "1C PASS 2NT PASS", "3NT"],
    ["opener: 3♣ with a long suit and extras, short of slam", "Q6.84.AK.KJT9852", "1C PASS 2NT PASS", "3C"],
    ["responder: raises opener's long clubs with support", north, "1C PASS 2NT PASS 3C PASS", "4C"],
    ["responder: accepts a quantitative 4NT with 15", "AQ4.KJ3.Q976.K82", "1C PASS 2NT PASS 4NT PASS", "6NT"],
    ["responder: declines it with 13", "A84.KJ3.Q976.Q82", "1C PASS 2NT PASS 4NT PASS", "PASS"],
  ])("%s", (_, hand, auction, expected) => {
    expect(bot(hand, auction, "S")).toBe(expected);
  });

  it("reads 4NT here as quantitative, not Blackwood", () => {
    const steps = readAuction({ dealer: "S", vul: "None" }, calls("1C PASS 2NT PASS 4NT"));
    expect(steps[4]!.read!.rule?.name).toBe("Quantitative 4NT");
  });
});

describe("1NT structures", () => {
  it.each([
    ["Stayman with a four-card major and game values", "KJ84.73.Q987.K82", "1NT PASS", "2C"],
    ["transfer to hearts", "84.KJ873.Q98.982", "1NT PASS", "2D"],
    ["transfer to spades", "KJ873.84.Q98.982", "1NT PASS", "2H"],
    ["invite with 8–9 and no major", "K84.Q73.J987.Q82", "1NT PASS", "2NT"],
    ["game with 10+ and no major", "K84.Q73.A987.Q82", "1NT PASS", "3NT"],
    ["pass when weak", "984.Q73.J987.982", "1NT PASS", "PASS"],
  ])("responder: %s", (_, hand, auction, expected) => {
    expect(bot(hand, auction)).toBe(expected);
  });

  it.each([
    ["answers Stayman with hearts", "AQ4.KJ93.Q97.K82", "1NT PASS 2C PASS", "2H"],
    ["answers Stayman with spades", "AQ94.KJ3.Q97.K82", "1NT PASS 2C PASS", "2S"],
    ["denies a major", "AQ4.KJ3.Q976.K82", "1NT PASS 2C PASS", "2D"],
    ["completes a transfer", "AQ4.K3.Q976.KJ82", "1NT PASS 2D PASS", "2H"],
    ["super-accepts with four trumps and a maximum", "AQ4.KJ32.Q97.AJ2", "1NT PASS 2D PASS", "3H"],
  ])("opener: %s", (_, hand, auction, expected) => {
    expect(bot(hand, auction)).toBe(expected);
  });

  it("raises to game in the major found by Stayman", () => {
    expect(bot("KJ84.73.AQ87.K82", "1NT PASS 2C PASS 2S PASS")).toBe("4S");
  });
});

describe("Blackwood", () => {
  it("answers with the number of aces", () => {
    // The auction: 1♠ by North, Jacoby 2NT, 3♠ (extras), 4NT. Answer with two aces.
    expect(bot("AKQ84.A73.K7.Q82", "1S PASS 2NT PASS 3S PASS 4NT PASS")).toBe("5H");
  });
});

describe("competition", () => {
  it.each([
    ["overcalls a good five-card suit", "84.KQJ84.A73.982", "1C", "1H"],
    ["takeout double: opening values, short in their suit", "AJ84.KQ73.A973.2", "1C", "X"],
    ["1NT overcall with a stopper", "AQ4.KJ3.Q976.KJ2", "1D", "1NT"],
    ["weak jump overcall", "KQJ984.73.982.82", "1D", "2S"],
    ["Michaels over a minor: both majors", "KQ984.QJ873.9.82", "1C", "2C"],
    ["unusual 2NT: both minors over a major", "8.4.KQ984.QJ8732", "1S", "2NT"],
  ])("%s", (_, hand, auction, expected) => {
    expect(bot(hand, auction)).toBe(expected);
  });

  it("negative double after an overcall", () => {
    // North opens 1♣, East overcalls 1♦; South has both majors.
    expect(bot("KJ84.Q973.84.982", "1C 1D")).toBe("X");
  });

  it("answers partner's Michaels with the better major, even after a double", () => {
    // Marc's board: West 1♣, North 2♣ (Michaels: both majors), East doubles. South has three spades, one heart.
    const d = chooseCall(parseHand("JT4.5.KQJT97.T53"), { dealer: "W", vul: "NS" }, calls("1C 2C X"));
    expect(callCode(d.call)).toBe("2S");
    expect(d.reason).toMatch(/spades/);
    // And without the double.
    expect(bot("JT4.5.KQJT97.T53", "1C 2C PASS", "W")).toBe("2S");
  });

  it("only raises a natural overcall, never a conventional one", () => {
    // Over Michaels the bot never 'supports' clubs.
    expect(bot("JT4.5.T53.KQJT97", "1C 2C X", "W")).not.toBe("3C");
  });

  it("answers partner's takeout double", () => {
    expect(bot("Q984.873.982.J82", "1D X PASS")).toBe("1S");
  });
});

describe("reading the auction", () => {
  it("records what each call showed", () => {
    const steps = readAuction({ dealer: "N", vul: "None" }, calls("1NT PASS 2C"));
    const after = steps.at(-1)!.position.shown;
    expect(after.N.hcp).toEqual([15, 17]);
    expect(after.N.balanced).toBe(true);
    expect(steps[2]!.read!.rule?.name).toBe("Stayman");
  });

  it("reads a call no rule describes as natural, and says so", () => {
    // 1NT then a jump to 5♥ by responder: no rule makes it.
    const steps = readAuction({ dealer: "N", vul: "None" }, calls("1NT PASS 5H"));
    expect(steps[2]!.read!.guessed).toBe(true);
    expect(steps[2]!.read!.meaning).toMatch(/no rule describes it/);
  });
});

describe("settings", () => {
  it("lists every setting with words, marking what isn't built yet", () => {
    const lines = describeSettings(SAYC_DEFAULTS);
    expect(lines.length).toBeGreaterThan(15);
    expect(lines.find((l) => l.label === "1NT opening")?.value).toBe("15–17 HCP");
    expect(lines.some((l) => !l.built)).toBe(true);
  });
});

describe("whole auctions on real game files", () => {
  const games = [
    ["the demo game", "../../../../backend/src/demo/demo-game.json"],
    ["the sample game", "../../../public/games/sample-synthetic-01.json"],
  ] as const;

  it.each(games)("the bots bid every board of %s legally to a finish, with a reason for every call", (_, path) => {
    const game = parseGameFile(JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")));
    for (const board of game.boards) {
      const deal = { dealer: board.dealer, vul: board.vul };
      const decisions = botAuction(board.hands, deal);
      const made: Call[] = [];
      for (const d of decisions) {
        expect(canCall(board.dealer, made, d.call), `board ${board.number}: ${callCode(d.call)} after ${made.map(callCode).join(" ")}`).toBe(true);
        expect(d.reason.length).toBeGreaterThan(0);
        made.push(d.call);
      }
      expect(isAuctionOver(made), `board ${board.number} didn't finish`).toBe(true);
      expect(auctionResult(board.dealer, made)).not.toBeNull();
      // Reviewing the bots' own auction: every call is what the bot would bid.
      expect(reviewAuction(board.hands, deal, made).every((r) => r.agrees)).toBe(true);
    }
  });
});

describe("your own bidding system", () => {
  const card = (changes: Partial<SystemSettings>): SystemSettings => ({ ...SAYC_DEFAULTS, ...changes });

  it("keeps only allowed choices when reading settings from storage or a request", () => {
    const s = parseSystemSettings({ oneNtMin: 16, oneNtMax: 18, weakTwos: false, stayman: "yes", negativeDoublesThrough: "9S", splinters: true, oneNtWithFiveCardMajor: false });
    expect([s.oneNtMin, s.oneNtMax]).toEqual([16, 18]);
    expect(s.weakTwos).toBe(false);
    expect(s.oneNtWithFiveCardMajor).toBe(false);
    expect(s.stayman).toBe(true); // not a boolean: ignored
    expect(s.negativeDoublesThrough).toBe("2S"); // not an option: ignored
    expect(s.splinters).toBe(false); // not built, so not editable
    expect(parseSystemSettings({ oneNtMin: 12, oneNtMax: 14 }).oneNtMin).toBe(15); // weak notrump isn't an option
    expect(parseSystemSettings("junk")).toEqual(SAYC_DEFAULTS);
    expect(isDefault(SAYC_DEFAULTS)).toBe(true);
    expect(isDefault(s)).toBe(false);
  });

  it("opens by your 1NT range", () => {
    const hand = parseHand("AQ4.KJ3.Q976.K82"); // 15 HCP, balanced
    expect(callCode(chooseCall(hand, { dealer: "N", vul: "None" }, []).call)).toBe("1NT");
    expect(callCode(chooseCall(hand, { dealer: "N", vul: "None" }, [], card({ oneNtMin: 16, oneNtMax: 18 })).call)).toBe("1D");
  });

  it("rebids 1NT up to just below your 1NT range", () => {
    // 1♦–1♠: 15 balanced is a 1NT rebid with a 16–18 notrump, a 1NT opening with 15–17.
    const d = chooseCall(parseHand("AQ4.KJ3.Q976.K82"), { dealer: "N", vul: "None" }, calls("1D PASS 1S PASS"), card({ oneNtMin: 16, oneNtMax: 18 }));
    expect(callCode(d.call)).toBe("1NT");
    expect(d.meaning).toMatch(/12–15/);
  });

  it("passes with a weak-two hand when weak twos are off", () => {
    expect(bot("84.KQJ984.73.982")).toBe("2H");
    expect(callCode(chooseCall(parseHand("84.KQJ984.73.982"), { dealer: "N", vul: "None" }, [], card({ weakTwos: false })).call)).toBe("PASS");
  });

  it("reads each side's calls by that side's card", () => {
    const systems = { NS: card({ oneNtMin: 16, oneNtMax: 18 }), EW: SAYC_DEFAULTS };
    const steps = readAuction({ dealer: "N", vul: "None" }, calls("1NT PASS PASS 1NT"), systems);
    const shown = steps.at(-1)!.position.shown;
    expect(shown.N.hcp).toEqual([16, 18]);
    expect(steps[3]!.read!.meaning).not.toMatch(/16–18/); // West's 1NT is a balancing overcall, by EW's card
  });
});

describe("3NT openings", () => {
  const gambling = { ...SAYC_DEFAULTS, threeNt: "gambling" as const };
  const solidClubs = "8.73.432.AKQJ982"; // 10 HCP, solid seven-card club suit, nothing outside
  const gamble = "A84.73.43.AKQJ982"; // the same, with the ♠A: a side suit stopped
  const big = "AKQ4.AKJ3.AQ7.K2"; // 26 HCP, balanced

  it("opens 3NT with 25–27 balanced, or with a solid minor when it's gambling", () => {
    const open = (hand: string, s = SAYC_DEFAULTS) => callCode(chooseCall(parseHand(hand), { dealer: "N", vul: "None" }, [], s).call);
    expect(open(big)).toBe("3NT");
    expect(open(solidClubs)).toBe("3C"); // nothing outside: a preempt, not a light 1♣
    expect(open(solidClubs, gambling)).toBe("3C"); // no side stopper: not a gambling 3NT either
    expect(open(gamble, gambling)).toBe("3NT");
    expect(open(big, gambling)).toBe("2C");
  });

  it("answers a gambling 3NT: pass with stoppers, otherwise clubs to pass or correct", () => {
    const answer = (hand: string) => callCode(chooseCall(parseHand(hand), { dealer: "N", vul: "None" }, calls("3NT PASS"), gambling).call);
    expect(answer("KJ4.AQ73.K82.973")).toBe("PASS");
    expect(answer("9874.Q73.K82.T97")).toBe("4C");
    // Opener corrects to diamonds with the diamond suit.
    expect(callCode(chooseCall(parseHand("8.73.AKQJ982.432"), { dealer: "N", vul: "None" }, calls("3NT PASS 4C PASS"), gambling).call)).toBe("4D");
  });
});

describe("interference over our 1NT", () => {
  const stolen = { ...SAYC_DEFAULTS, ntTwoClubs: "stolen" as const };
  const deal = { dealer: "N", vul: "None" } as const;

  it("keeps transfers on over a double, or turns them off, as the settings say", () => {
    const hearts = parseHand("84.KJ873.Q98.982");
    expect(callCode(chooseCall(hearts, deal, calls("1NT X")).call)).toBe("2D");
    expect(callCode(chooseCall(hearts, deal, calls("1NT X"), { ...SAYC_DEFAULTS, ntDoubled: "off" }).call)).not.toBe("2D");
  });

  it("doubles their 2♣ as Stayman when it's a stolen bid, and opener answers it", () => {
    const d = chooseCall(parseHand("KJ84.73.Q987.K82"), deal, calls("1NT 2C"), stolen);
    expect(callCode(d.call)).toBe("X");
    expect(d.name).toBe("Stayman");
    expect(callCode(chooseCall(parseHand("AQ94.KJ3.Q97.K82"), deal, calls("1NT 2C X PASS"), stolen).call)).toBe("2S");
    // With systems off, the double isn't Stayman.
    expect(chooseCall(parseHand("KJ84.73.Q987.K82"), deal, calls("1NT 2C")).name).not.toBe("Stayman");
  });

  it("turns systems off when they bid 2♦ or higher", () => {
    expect(callCode(chooseCall(parseHand("84.KJ873.Q98.982"), deal, calls("1NT 2D"), stolen).call)).not.toBe("2H");
  });
});

describe("weak twos", () => {
  it("need a good suit: two of the top three honours, or three of the top five", () => {
    expect(bot("84.KQ9842.J3.982")).toBe("2H"); // ♥KQ: two of the top three
    expect(bot("84.QJT984.K3.982")).toBe("2H"); // ♥QJT: three of the top five
    expect(bot("84.KJ9842.Q3.982")).not.toBe("2H"); // ♥KJ: neither
  });
});

describe("when they double our part score", () => {
  it("passes when the doubled contract is already a game (Marc's board: 3♥ doubled)", () => {
    // East passes, South 1♦, West 1♠, North negative double, East 2♠, South 3♥, West doubles.
    const d = chooseCall(parseHand("K74.Q98765.2.K76"), { dealer: "E", vul: "EW" }, calls("PASS 1D 1S X 2S 3H X"));
    expect(callCode(d.call)).toBe("PASS");
    expect(d.reason).toMatch(/already a game/);
  });
});

describe("a takeout double of our part score", () => {
  it("isn't treated as doubled into game: the doubler's partner will bid", () => {
    // Demo board 36: 1♥–2♦–3♦, East doubles for takeout. South mustn't pass "because 3♦ doubled is game".
    const d = chooseCall(parseHand("T65.5.AK873.QJT8"), { dealer: "W", vul: "Both" }, calls("PASS 1H PASS 2D PASS 3D X"));
    expect(d.reason).not.toMatch(/already a game/);
  });
});

describe("overcalls over a conventional bid", () => {
  const deal = { dealer: "N", vul: "None" } as const;
  const over2C = (hand: string, vul: "None" | "EW" = "None") => callCode(chooseCall(parseHand(hand), { ...deal, vul }, calls("2C")).call);

  it("shows a good suit naturally over a strong 2♣", () => {
    expect(over2C("84.KQJ984.73.982")).toBe("2H"); // six hearts: length and tricks both say the two level
    expect(over2C("8.AKQJ987.73.982")).toBe("4H"); // 7 playing tricks, non-vulnerable: overbid by 3
    expect(over2C("8.AKQJ987.73.982", "EW")).toBe("3H"); // vulnerable: by 2, and seven cards say 3 too
    expect(over2C("984.Q7.J73.K982")).toBe("PASS");
  });

  it("bids seven with a thirteen-card suit (the one-suit test deal)", () => {
    expect(over2C(".AKQJT98765432..")).toBe("7H");
  });
});
