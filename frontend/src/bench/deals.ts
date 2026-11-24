// Deal sets for the evaluation harness (docs/HARNESS.md). Stage 1 tests the partnership's bidding
// with the opponents silent, so a set holds deals where neither East nor West has a clear bid, and
// the ideal contract is worked out over many layouts of East–West's cards that pass the same test.
//
// Everything here is frozen on purpose: the filter doesn't use the bot's bidder (so a bidding change
// never changes the test), and the same definition always deals the same boards. Change the filter
// or the dealing only with a new version number, which makes a new set.

import { boardDealer, boardVulnerability, handToString, parsePbnDeal, randomDeal } from "../core/deal";
import { hash, seeded } from "../core/random";
import { type Hand, type Seat, type Vulnerability, RANKS, SEATS, SUITS } from "../core/types";

/** Version of the "no clear bid" filter and the dealing below. */
export const FILTER_VERSION = 1;

/** What a set is made from. Kept in bench/sets.json; the boards are rebuilt from it exactly. */
export interface SetDefinition {
  stage: 1;
  /** Number of deals. */
  deals: number;
  seed: number;
  /** Layouts of East–West's cards per deal, for the ideal contract. */
  layouts: number;
  filter: number;
}

export const DEFAULT_SET: SetDefinition = { stage: 1, deals: 1000, seed: 1, layouts: 50, filter: FILTER_VERSION };

export interface BenchDeal {
  /** Board number in the set, from 1. Dealer and vulnerability follow the usual board rotation. */
  id: number;
  dealer: Seat;
  vul: Vulnerability;
  /** All four hands, as a PBN deal ("N:… … … …"). */
  pbn: string;
}

const HCP: Record<string, number> = { A: 4, K: 3, Q: 2, J: 1 };

/**
 * Would this hand clearly bid (open, overcall or preempt) at some point? Deliberately loose about
 * borderline hands: it keeps only hands that almost anyone would pass throughout.
 */
export function hasClearBid(hand: Hand): boolean {
  const lens = SUITS.map((s) => hand[s].length);
  const hcp = SUITS.reduce((n, s) => n + [...hand[s]].reduce((m, r) => m + (HCP[r] ?? 0), 0), 0);
  const [longest, second] = [...lens].sort((a, b) => b - a) as [number, number];
  if (hcp >= 12 || hcp + longest + second >= 20) return true; // an opening hand (rule of 20)
  if (longest >= 7 && hcp >= 5) return true; // a preempt
  if (longest >= 6 && hcp >= 8) return true; // a weak two or a clear overcall
  if (lens.filter((l) => l >= 5).length >= 2 && hcp >= 8) return true; // a two-suiter
  if (longest >= 5 && hcp >= 10) return true; // a clear overcall
  return false;
}

/** The set's deals: random deals where neither East nor West has a clear bid. */
export function dealSet(def: SetDefinition): BenchDeal[] {
  const rand = seeded(def.seed);
  const out: BenchDeal[] = [];
  for (let id = 1; id <= def.deals; id++) {
    let hands = randomDeal(rand);
    while (hasClearBid(hands.E) || hasClearBid(hands.W)) hands = randomDeal(rand);
    out.push({ id, dealer: boardDealer(id), vul: boardVulnerability(id), pbn: toPbn(hands) });
  }
  return out;
}

export const toPbn = (hands: Record<Seat, Hand>) => "N:" + SEATS.map((s) => handToString(hands[s])).join(" ");
export const handsOf = (deal: BenchDeal) => parsePbnDeal(deal.pbn);

/**
 * Layouts of East–West's 26 cards around North–South's real hands, each passing the same "no clear
 * bid" test as the set. Seeded from the set's seed and the board, so they're the same every build.
 */
export function ewLayouts(deal: BenchDeal, def: SetDefinition): Record<Seat, Hand>[] {
  const hands = handsOf(deal);
  const pool: string[] = [];
  for (const seat of ["E", "W"] as const) for (const s of SUITS) for (const r of hands[seat][s]) pool.push(s + r);
  const rand = seeded(hash(`${def.seed}|${def.filter}|${deal.id}`));
  const out: Record<Seat, Hand>[] = [];
  for (let tries = 0; out.length < def.layouts; tries++) {
    if (tries > 1_000_000) throw new Error(`Board ${deal.id}: too few layouts pass the filter`);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    const east = handFrom(pool.slice(0, 13));
    const west = handFrom(pool.slice(13));
    if (hasClearBid(east) || hasClearBid(west)) continue;
    out.push({ N: hands.N, S: hands.S, E: east, W: west });
  }
  return out;
}

/** A hand from cards written suit then rank ("SA", "H7"), each suit high to low. */
function handFrom(cards: string[]): Hand {
  const hand: Hand = { S: "", H: "", D: "", C: "" };
  for (const c of cards) hand[c[0] as keyof Hand] += c[1];
  for (const s of SUITS) hand[s] = [...hand[s]].sort((a, b) => RANKS.indexOf(a) - RANKS.indexOf(b)).join("");
  return hand;
}
