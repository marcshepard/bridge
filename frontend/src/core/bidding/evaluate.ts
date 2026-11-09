// Hand facts a bidder works from: points, shape, suit quality, stoppers. Pure functions of one
// hand; nothing here knows the auction.

import { hcp as hcpOf } from "../deal";
import { type Hand, type Suit, SUITS } from "../types";

export interface HandFacts {
  hand: Hand;
  hcp: number;
  len: Record<Suit, number>;
  /** Suit lengths, longest first, e.g. [5, 4, 2, 2]. */
  shape: number[];
  /** 4-3-3-3, 4-4-3-2 or 5-3-3-2. */
  balanced: boolean;
  /** Balanced, or 5-4-2-2 / 6-3-2-2: fine for notrump at a pinch. */
  semiBalanced: boolean;
  /** One point for each card over four in a suit. */
  lengthPoints: number;
  /** Goren's count for the long-suit hand: 3 for a void, 2 for a singleton, 1 for a doubleton. */
  shortnessPoints: number;
  /**
   * HCP plus distribution, counted the way the settings say (length or shortness points): the
   * measure for opening, overcalling and your own long suit. Raising partner counts support points
   * instead (`supportPoints`).
   */
  points: number;
  /**
   * Playing tricks: what the hand takes on its own with its long suit as trumps. In a suit of five
   * or more, its length less its losers among the top three cards; in a shorter suit, only its
   * sure winners (A, AK, AKQ, KQ). For hands where points mislead, like a long solid suit.
   */
  tricks: number;
  aces: number;
  kings: number;
}

const HONOURS = "AKQJT";

/** How the long-suit hand counts its distribution (a setting): length points, or Goren's 3/2/1 for short suits. */
export type DistributionCount = "length" | "shortness";

export function evaluate(hand: Hand, distribution: DistributionCount = "length"): HandFacts {
  const len = Object.fromEntries(SUITS.map((s) => [s, hand[s].length])) as Record<Suit, number>;
  const shape = SUITS.map((s) => len[s]).sort((a, b) => b - a);
  const key = shape.join("");
  const hcp = hcpOf(hand);
  const lengthPoints = SUITS.reduce((n, s) => n + Math.max(0, len[s] - 4), 0);
  const shortnessPoints = SUITS.reduce((n, s) => n + (len[s] <= 2 ? [3, 2, 1][len[s]]! : 0), 0);
  return {
    shortnessPoints,
    tricks: SUITS.reduce((n, s) => n + suitTricks(hand[s]), 0),
    hand,
    hcp,
    len,
    shape,
    balanced: key === "4333" || key === "4432" || key === "5332",
    semiBalanced: ["4333", "4432", "5332", "5422", "6322"].includes(key),
    lengthPoints,
    points: hcp + (distribution === "shortness" ? shortnessPoints : lengthPoints),
    aces: SUITS.filter((s) => hand[s].includes("A")).length,
    kings: SUITS.filter((s) => hand[s].includes("K")).length,
  };
}

/**
 * Playing tricks in one suit ("AKQJ987" → 7). Five or more cards: the length less the losers among
 * the top three (a missing ace, king or queen, each a loser), so KQJ1098 is 5. Shorter: sure
 * winners only, A, AK, AKQ, or KQ (K542 is none: its length won't make tricks by itself).
 */
export function suitTricks(ranks: string): number {
  const n = ranks.length;
  if (n >= 5) return n - ["A", "K", "Q"].filter((r) => !ranks.includes(r)).length;
  if (ranks.startsWith("AKQ")) return 3;
  if (ranks.startsWith("AK")) return 2;
  if (ranks.startsWith("A")) return 1;
  if (ranks.startsWith("KQ")) return 1;
  return 0;
}

/** How many of the top five honours (A K Q J T) the suit holds. */
export function honours(h: HandFacts, suit: Suit): number {
  return [...h.hand[suit]].filter((r) => HONOURS.includes(r)).length;
}

/** How many of the top three honours (A K Q) the suit holds. */
export function topHonours(h: HandFacts, suit: Suit): number {
  return [...h.hand[suit]].filter((r) => "AKQ".includes(r)).length;
}

/** A suit worth showing on its own: two of the top three honours, or three of the top five. */
export function goodSuit(h: HandFacts, suit: Suit): boolean {
  return topHonours(h, suit) >= 2 || honours(h, suit) >= 3;
}

/** A suit fit to overcall or preempt in: at least one of the top three and two of the top five. */
export function decentSuit(h: HandFacts, suit: Suit): boolean {
  return topHonours(h, suit) >= 1 && honours(h, suit) >= 2;
}

/** A stopper for notrump: A, Kx, Qxx or Jxxx. */
export function stopper(h: HandFacts, suit: Suit): boolean {
  const s = h.hand[suit];
  return s.includes("A") || (s.includes("K") && s.length >= 2) || (s.includes("Q") && s.length >= 3) || (s.includes("J") && s.length >= 4);
}

/** HCP in one suit. */
export function suitHcp(h: HandFacts, suit: Suit): number {
  const value: Record<string, number> = { A: 4, K: 3, Q: 2, J: 1 };
  return [...h.hand[suit]].reduce((n, r) => n + (value[r] ?? 0), 0);
}

/**
 * Points for raising partner's suit: HCP plus shortness, which is worth more the more trumps you
 * hold (void 5, singleton 3, doubleton 1 with four trumps; 3, 2 and 1 with three).
 */
export function supportPoints(h: HandFacts, trump: Suit): number {
  const trumps = h.len[trump];
  if (trumps < 3) return h.hcp;
  const scale = trumps >= 4 ? [5, 3, 1] : [3, 2, 1];
  const shortness = SUITS.filter((s) => s !== trump).reduce((n, s) => n + (h.len[s] <= 2 ? scale[h.len[s]]! : 0), 0);
  return h.hcp + shortness;
}

/** Rule of 20: HCP plus the two longest suits' lengths make 20 or more. */
export function ruleOf20(h: HandFacts): boolean {
  return h.hcp + h.shape[0]! + h.shape[1]! >= 20;
}

/** Rule of 15 (fourth seat): HCP plus the number of spades make 15 or more. */
export function ruleOf15(h: HandFacts): boolean {
  return h.hcp + h.len.S >= 15;
}

/** Suits in order of length, longest first; equal lengths higher-ranking first. */
export function suitsByLength(h: HandFacts): Suit[] {
  return [...SUITS].sort((a, b) => h.len[b] - h.len[a] || SUITS.indexOf(a) - SUITS.indexOf(b));
}

/** "AKJ52" as written in a reason: "♠AKJ52". */
export function holding(h: HandFacts, suit: Suit): string {
  return `${SYMBOL[suit]}${h.hand[suit] || "—"}`;
}

export const SYMBOL: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const SUIT_WORDS: Record<Suit, string> = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };
export const isMajor = (s: Suit) => s === "S" || s === "H";
