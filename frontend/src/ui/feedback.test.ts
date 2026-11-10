import { describe, expect, it } from "vitest";
import { parseCall } from "../core/auction";
import { reviewAuction } from "../core/bidding/bidder";
import { SAYC_DEFAULTS } from "../core/bidding/system";
import { parsePbnDeal } from "../core/deal";
import { parseReplayLine } from "../providers/replayLine";
import { bidFeedbackBody, bidFeedbackHref } from "./feedback";

const DEAL = "N:AQ84.QT98.J.KQ43 K.KJ632.AT962.75 T76.54.753.AJT82 J9532.A7.KQ84.96";
const board = { number: 7, dealer: "N" as const, vul: "Both" as const, hands: parsePbnDeal(DEAL), field: [] };
const calls = ["1C", "1H", "PASS", "PASS", "PASS"].map((c) => parseCall(c)!);
const systems = { NS: SAYC_DEFAULTS, EW: { ...SAYC_DEFAULTS, gerber: false } };
const review = reviewAuction(board.hands, { dealer: board.dealer, vul: board.vul }, calls, systems);

describe("bidding feedback email", () => {
  it("says what's disputed, then the bot's reason, board, auction and hands", () => {
    const body = bidFeedbackBody({ board, calls, index: 1, review: review[1]!, mine: false, systems });
    const lines = body.split("\n");
    expect(lines[0]).toBe("I don't think the bot's 1♥ as East was right.");
    expect(lines[1]).toBe("I would have bid: ");
    expect(body).toContain("Board 7 · Dealer North · Both vulnerable");
    expect(body).toContain("Bidding: North–South SAYC; East–West SAYC with Gerber No");
    expect(body).toContain("N 1♣   E 1♥   S Pass   W Pass  ← East's 1♥");
    expect(body).toContain("\nN Pass\n");
    expect(body).toContain("North  ♠ AQ84  ♥ QT98  ♦ J  ♣ KQ43");
  });

  it("for your own call the bot disagreed with, questions its suggestion", () => {
    const mine = { ...review[1]!, agrees: false, bot: { ...review[1]!.bot, call: parseCall("PASS")! } };
    expect(bidFeedbackBody({ board, calls, index: 1, review: mine, mine: true, systems }).split("\n")[0]).toBe(
      "I bid 1♥ as East. I don't think the bot's suggestion of Pass was right.",
    );
  });

  it("ends with a replay line that reads back to the same board", () => {
    const body = bidFeedbackBody({ board, calls, index: 1, review: review[1]!, mine: false, systems });
    const back = parseReplayLine(body.split("\n").at(-1)!);
    expect(back.board).toEqual(board);
    expect(back.calls).toEqual(calls);
    expect(back.reported).toBe(1);
    expect(back.systems).toEqual(systems);
  });

  it("is a mailto: link to the feedback address", () => {
    const href = bidFeedbackHref({ board, calls, index: 1, review: review[1]!, mine: false, systems });
    expect(href.startsWith("mailto:navia.apps@gmail.com?subject=Bridge%20Replay%20bidding%20feedback&body=")).toBe(true);
    expect(href).toContain("%0D%0A");
  });
});
