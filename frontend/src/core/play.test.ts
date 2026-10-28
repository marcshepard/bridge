import { describe, expect, it } from "vitest";
import { chooseCard } from "./bot";
import { parseHand, parsePbnDeal } from "./deal";
import {
  type Card,
  claimAccepted,
  claimAnswerers,
  finalTricks,
  type PlayState,
  type Trick,
  isComplete,
  legalCards,
  playCard,
  startPlay,
  toPlay,
  trickWinner,
  tricksWon,
} from "./play";
import type { Seat, Strain } from "./types";

// Each side suit split 4-3-3-3, so whoever holds the top four of a suit wins it.
const DEAL = parsePbnDeal("N:AKQJ.432.432.432 T98.AKQJ.765.765 765.T98.AKQJ.T98 432.765.T98.AKQJ");

const c = (text: string): Card => ({ suit: text[0] as Card["suit"], rank: text.slice(1) });

/** A position part-way through a hand: hands as "♠.♥.♦.♣" strings, and the trick so far. */
function position(
  hands: Partial<Record<Seat, string>>,
  trump: Strain,
  declarer: Seat,
  trick: { leader: Seat; cards: string[] },
  earlier: Trick[] = [],
): PlayState {
  const all = { N: "...", E: "...", S: "...", W: "...", ...hands };
  const parsed = Object.fromEntries(Object.entries(all).map(([s, h]) => [s, parseHand(h)])) as PlayState["hands"];
  const seats: Seat[] = ["N", "E", "S", "W"];
  const at = seats.indexOf(trick.leader);
  const cards = trick.cards.map((t, i) => ({ seat: seats[(at + i) % 4]!, card: c(t) }));
  return { hands: parsed, trump, declarer, tricks: [...earlier, { leader: trick.leader, cards }] };
}

/** A finished trick, so a later lead isn't the opening lead. */
const done = (leader: Seat, ...cards: string[]): Trick => {
  const seats: Seat[] = ["N", "E", "S", "W"];
  const at = seats.indexOf(leader);
  return { leader, cards: cards.map((t, i) => ({ seat: seats[(at + i) % 4]!, card: c(t) })) };
};

describe("card play rules", () => {
  it("starts with declarer's left-hand opponent on lead", () => {
    expect(toPlay(startPlay(DEAL, "S", "S"))).toBe("W");
    expect(toPlay(startPlay(DEAL, "NT", "W"))).toBe("N");
  });

  it("makes you follow suit when you can", () => {
    let s = startPlay(DEAL, "NT", "S");
    s = playCard(s, c("CA")); // West leads a club
    expect(legalCards(s, "N").map((x) => x.rank)).toEqual(["4", "3", "2"]);
    expect(() => playCard(s, c("SA"))).toThrow();
  });

  it("lets you play anything when you can't follow", () => {
    const s = position({ E: "AK.2.." }, "NT", "S", { leader: "N", cards: ["DA"] });
    expect(legalCards(s, "E")).toHaveLength(3);
  });

  it("gives the trick to the highest trump, else the highest card of the suit led", () => {
    const t = (cards: string[], trump: Strain) => trickWinner(done("W", ...cards), trump)!.seat;
    expect(t(["H5", "HQ", "HK", "S2"], "NT")).toBe("E"); // South's spade is a discard
    expect(t(["H5", "HQ", "HK", "S2"], "S")).toBe("S");
    expect(t(["H5", "HQ", "D2", "S2"], "NT")).toBe("N");
  });

  it("has the winner lead the next trick, and counts tricks for each side", () => {
    let s = startPlay(DEAL, "NT", "S");
    for (const card of ["CA", "C4", "C7", "C8"]) s = playCard(s, c(card)); // W wins
    expect(toPlay(s)).toBe("W");
    expect(tricksWon(s)).toEqual({ declarer: 0, defence: 1 });
  });

  it("plays a whole hand with robots in every seat", () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let s = startPlay(DEAL, "H", "N");
    while (!isComplete(s)) s = playCard(s, chooseCard(s, rand));
    const won = tricksWon(s);
    expect(won.declarer + won.defence).toBe(13);
  });
});

describe("the robot following", () => {
  it("plays low second hand", () => {
    const s = position({ N: ".AQ3.." }, "NT", "S", { leader: "W", cards: ["H5"] });
    expect(chooseCard(s)).toEqual(c("H3"));
  });

  it("plays high third hand", () => {
    const s = position({ E: ".K72.." }, "NT", "S", { leader: "W", cards: ["H5", "H3"] });
    expect(chooseCard(s)).toEqual(c("HK"));
  });

  it("plays low third hand when partner is already winning", () => {
    const s = position({ E: ".K72.." }, "NT", "S", { leader: "W", cards: ["HA", "H3"] });
    expect(chooseCard(s)).toEqual(c("H2"));
  });

  it("wins as cheaply as it can fourth hand", () => {
    const s = position({ S: ".AJT.." }, "NT", "N", { leader: "W", cards: ["H5", "H9", "H2"] });
    expect(chooseCard(s)).toEqual(c("HT"));
  });

  it("plays low fourth hand when it can't win", () => {
    const s = position({ S: ".84.." }, "NT", "N", { leader: "W", cards: ["H5", "HQ", "H2"] });
    expect(chooseCard(s)).toEqual(c("H4"));
  });

  it("ruffs as low as it can when it can't follow", () => {
    const s = position({ N: "Q7..5." }, "S", "S", { leader: "W", cards: ["HA"] });
    expect(chooseCard(s)).toEqual(c("S7"));
  });

  it("overruffs, or discards when it can't", () => {
    expect(chooseCard(position({ E: "92...4" }, "S", "S", { leader: "W", cards: ["HA", "S3"] }))).toEqual(c("S9"));
    expect(chooseCard(position({ E: "2...4" }, "S", "S", { leader: "W", cards: ["HA", "S3"] }))).toEqual(c("C4"));
  });

  it("doesn't ruff partner's winner; discards from the shortest side suit", () => {
    const s = position({ S: "7..K5.9" }, "S", "E", { leader: "N", cards: ["HA", "H2"] });
    expect(chooseCard(s)).toEqual(c("C9"));
  });
});

describe("the robot leading", () => {
  it("leads fourth from the longest suit against no trumps", () => {
    const s = position({ W: "K8643.Q2.J75.T9" }, "NT", "S", { leader: "W", cards: [] });
    expect(chooseCard(s)).toEqual(c("S4"));
  });

  it("leads the top of a sequence against no trumps", () => {
    const s = position({ W: "KQJ52.Q2.J75.T9" }, "NT", "S", { leader: "W", cards: [] });
    expect(chooseCard(s)).toEqual(c("SK"));
  });

  it("leads the top of a sequence, else an ace, against a suit", () => {
    expect(chooseCard(position({ W: "KQ5.832.A74.9632" }, "H", "S", { leader: "W", cards: [] }))).toEqual(c("SK"));
    expect(chooseCard(position({ W: "J75.832.A74.Q632" }, "H", "S", { leader: "W", cards: [] }))).toEqual(c("DA"));
  });

  it("returns partner's suit", () => {
    const earlier = [done("E", "D3", "D9", "DA", "D2")]; // East led a diamond, West won it
    const s = position({ W: "K5.84.Q76.J32", N: "AQ.K9.J8.T54" }, "NT", "S", { leader: "W", cards: [] }, earlier);
    expect(chooseCard(s)).toEqual(c("D6"));
  });

  it("leads through dummy's strength when dummy plays next", () => {
    // South declares, so North is dummy, on West's left: lead dummy's strongest suit.
    const earlier = [done("W", "C2", "C3", "C4", "C5")];
    const s = position({ W: "754.J72.T3.", N: "AQ2.954.K8." }, "NT", "S", { leader: "W", cards: [] }, earlier);
    expect(chooseCard(s)).toEqual(c("S4"));
  });

  it("leads up to dummy's weakness when dummy plays last", () => {
    // South declares, so North is dummy, on East's right: lead dummy's weakest suit.
    const earlier = [done("E", "C2", "C3", "C4", "C5")];
    const s = position({ E: "754.J72.T3.", N: "AQ2.954.K8." }, "NT", "S", { leader: "E", cards: [] }, earlier);
    expect(chooseCard(s)).toEqual(c("H2"));
  });
});

describe("claims", () => {
  it("are answered by the claimer's opponents, but never by dummy", () => {
    expect(claimAnswerers("S", "S")).toEqual(["E", "W"]); // declarer claims: both defenders
    expect(claimAnswerers("E", "S")).toEqual(["S"]); // a defender claims: declarer alone
    expect(claimAccepted({ seat: "S", tricks: 3, acceptedBy: ["E"] }, "S")).toBe(false);
    expect(claimAccepted({ seat: "S", tricks: 3, acceptedBy: ["W", "E"] }, "S")).toBe(true);
  });

  it("give the result once accepted: tricks won plus the claimer's side's share of those left", () => {
    let s = startPlay(DEAL, "NT", "S");
    for (const card of ["CA", "C4", "C7", "C8"]) s = playCard(s, c(card)); // the defence wins one
    expect(finalTricks(s, null)).toBeNull(); // still playing
    expect(finalTricks(s, { seat: "S", tricks: 9, acceptedBy: ["E"] })).toBeNull(); // not yet accepted
    expect(finalTricks(s, { seat: "S", tricks: 9, acceptedBy: ["E", "W"] })).toBe(9);
    expect(finalTricks(s, { seat: "W", tricks: 3, acceptedBy: ["S"] })).toBe(9); // 12 left, 3 to the defence
  });

  it("aren't needed once every card is played", () => {
    let s = startPlay(DEAL, "NT", "S");
    while (!isComplete(s)) s = playCard(s, chooseCard(s, () => 0.5));
    expect(finalTricks(s, null)).toBe(tricksWon(s).declarer);
  });
});
