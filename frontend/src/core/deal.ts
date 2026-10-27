// Hands and deals: parsing the compact text forms and checking a deal is a real 52-card deal.
//
// A hand string is the four suits in ♠ ♥ ♦ ♣ order separated by dots, ranks high to low, "T" for ten:
//     "AKQ2.JT9.876.543"     (an empty suit is just empty: "AKQJT98765432...")
// A PBN deal string starts with the first seat, then the four hands clockwise:
//     "N:AKQ2.JT9.876.543 J98.AKQ.5432.T9 ..."

import { type Hand, type Seat, RANKS, SEATS, SUITS } from "./types";

export function parseHand(text: string): Hand {
  const parts = text.trim().toUpperCase().replace(/10/g, "T").split(".");
  if (parts.length !== 4) throw new Error(`Hand "${text}" must have four suits separated by dots`);
  const hand = {} as Hand;
  SUITS.forEach((suit, i) => {
    const ranks = parts[i]!.replace(/-/g, "");
    for (const ch of ranks) {
      if (!RANKS.includes(ch)) throw new Error(`Hand "${text}" has unknown rank "${ch}"`);
    }
    // Normalise to high-to-low order.
    hand[suit] = [...ranks].sort((a, b) => RANKS.indexOf(a) - RANKS.indexOf(b)).join("");
  });
  return hand;
}

export function handToString(hand: Hand): string {
  return SUITS.map((s) => hand[s]).join(".");
}

export function cardCount(hand: Hand): number {
  return SUITS.reduce((n, s) => n + hand[s].length, 0);
}

/** High-card points: A=4 K=3 Q=2 J=1. */
export function hcp(hand: Hand): number {
  const value: Record<string, number> = { A: 4, K: 3, Q: 2, J: 1 };
  return SUITS.reduce((n, s) => n + [...hand[s]].reduce((m, r) => m + (value[r] ?? 0), 0), 0);
}

/** Parse a PBN [Deal] value, e.g. "N:AKQ2.JT9.876.543 ...". */
export function parsePbnDeal(text: string): Record<Seat, Hand> {
  const m = /^\s*([NESW])\s*:\s*(.+)$/i.exec(text);
  if (!m) throw new Error(`Deal "${text}" must start with a seat, e.g. "N:"`);
  const first = SEATS.indexOf(m[1]!.toUpperCase() as Seat);
  const hands = m[2]!.trim().split(/\s+/);
  if (hands.length !== 4) throw new Error(`Deal "${text}" must have four hands`);
  const deal = {} as Record<Seat, Hand>;
  hands.forEach((h, i) => {
    deal[SEATS[(first + i) % 4]!] = parseHand(h);
  });
  return deal;
}

/** Throws unless the four hands hold each of the 52 cards exactly once. */
export function assertValidDeal(deal: Record<Seat, Hand>): void {
  const seen = new Set<string>();
  for (const seat of SEATS) {
    const hand = deal[seat];
    if (!hand) throw new Error(`Missing hand for ${seat}`);
    if (cardCount(hand) !== 13) throw new Error(`${seat} has ${cardCount(hand)} cards, not 13`);
    for (const suit of SUITS) {
      for (const rank of hand[suit]) {
        const card = suit + rank;
        if (seen.has(card)) throw new Error(`${card} appears twice`);
        seen.add(card);
      }
    }
  }
}
