import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Call, auctionResult, callCode, canCall, isAuctionOver, parseCall } from "../auction";
import { parseHand } from "../deal";
import type { Seat, Vulnerability } from "../types";
import { parseGameFile } from "../../providers/gameFile";
import { botAuction, chooseCall, readAuction, reviewAuction } from "./bidder";
import { describeSettings, SAYC_DEFAULTS } from "./system";
import { evaluate, suitTricks } from "./evaluate";

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
    ["limit raise", "K84.Q73.A987.Q82", "1H PASS", "3H"],
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
    ["AKQJ987", 7],
    ["KQJT98", 5],
    ["AKQJT98765432", 13],
    ["K542", 0], // a short side suit: only sure winners count
    ["AK2", 2],
    ["KQ", 1],
  ])("playing tricks in %s: %i", (ranks, tricks) => {
    expect(suitTricks(ranks)).toBe(tricks);
  });

  it("counts the long-suit hand's shape by length points or by shortness, as the settings say", () => {
    const hand = parseHand("AKQ32.KJ32.Q32."); // 15 HCP, a five-card suit, a void
    expect(evaluate(hand, "length").points).toBe(16);
    expect(evaluate(hand, "shortness").points).toBe(18);
  });

  it("opens 2♣ with nine playing tricks, however few the HCP", () => {
    expect(bot("AKQJT98765432...")).toBe("2C");
    expect(bot("AKQJT987.A.A32.32")).toBe("2C"); // 8 + 1 + 1 tricks, 17 HCP
  });

  it("bids the grand slam its own tricks make", () => {
    expect(bot("AKQJT98765432...", "2C PASS 2D PASS")).toBe("7S");
  });

  it("still finds the slam on demo board 1 (the long hand counts its void once partner supports)", () => {
    const hands = {
      N: parseHand("73.T7.T63.QJT943"),
      E: parseHand("K542.KQJ854..AK2"),
      S: parseHand("QJT98.62.AK94.85"),
      W: parseHand("A6.A93.QJ8752.76"),
    };
    const made = botAuction(hands, { dealer: "N", vul: "None" }).map((d) => d.call);
    expect(auctionResult("N", made)?.contract).toMatchObject({ level: 6, strain: "H" });
  });

  it("when outbid past its target, makes a hard call instead of bidding on", () => {
    // North opens 1♠, partner raises; they bid to 5♥ over our 4♠.
    const d = chooseCall(parseHand("AKJ84.32.KQ4.Q32"), { dealer: "N", vul: "None" }, calls("1S 2H 2S 4H 4S 5H PASS PASS"));
    expect(d.hard).not.toBeNull();
    expect(d.call.kind).not.toBe("bid");
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
