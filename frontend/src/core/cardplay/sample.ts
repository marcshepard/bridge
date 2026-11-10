// What a bot knows during the play, and deals of the hands it can't see.
//
// Hard facts: its own hand; dummy's once the opening lead is made; every card played; who has shown
// out of a suit. Soft facts: what each hand's bids showed (HCP and suit lengths). Bidding light is
// common, and so are false cards, so a deal that fits the bids exactly counts in full, one a little
// off counts a third, and one further off is left out. The bot never looks at the real hidden hands.

import type { Shown } from "../bidding/model";
import type { SystemSettings } from "../bidding/system";
import { cardingWeight } from "./inference";
import { type Card, type PlayState, currentTrick, dummyOf } from "../play";
import { type Hand, type Seat, type Suit, RANKS, SEATS, SUITS } from "../types";

const HCP: Record<string, number> = { A: 4, K: 3, Q: 2, J: 1 };

/** A deal of everyone's remaining cards, and how much it counts (1, or a third for near misses). */
export interface WeightedDeal {
  hands: Record<Seat, Hand>;
  weight: number;
}

/** Who decides the card: the seat to play, or declarer for dummy. */
export function decider(state: PlayState, mover: Seat): Seat {
  return mover === dummyOf(state.declarer) ? state.declarer : mover;
}

/** Dummy is face up once the opening lead has been made. */
export const dummyVisible = (state: PlayState) => state.tricks.length > 1 || currentTrick(state).cards.length > 0;

/** The cards each seat has played so far. */
export function playedBy(state: PlayState): Record<Seat, Card[]> {
  const out = { N: [], E: [], S: [], W: [] } as Record<Seat, Card[]>;
  for (const t of state.tricks) for (const p of t.cards) out[p.seat].push(p.card);
  return out;
}

/** Suits each seat has shown out of (failed to follow), so can't hold any more. */
export function voids(state: PlayState): Record<Seat, Set<Suit>> {
  const out = { N: new Set<Suit>(), E: new Set<Suit>(), S: new Set<Suit>(), W: new Set<Suit>() };
  for (const t of state.tricks) {
    const led = t.cards[0]?.card.suit;
    for (const p of t.cards.slice(1)) if (led && p.card.suit !== led) out[p.seat].add(led);
  }
  return out;
}

/** The seats whose remaining cards the decider can't see (`visible`: hands shown, such as a claimer's). */
export function hiddenSeats(state: PlayState, who: Seat, visible: Seat[] = []): Seat[] {
  const dummy = dummyOf(state.declarer);
  return SEATS.filter((s) => s !== who && !visible.includes(s) && !(s === dummy && dummyVisible(state)));
}

const cardIndex = (c: Card) => SUITS.indexOf(c.suit) * 13 + RANKS.indexOf(c.rank);
const toCard = (i: number): Card => ({ suit: SUITS[Math.floor(i / 13)]!, rank: RANKS[i % 13]! });

function handOf(indices: number[]): Hand {
  const hand = { S: "", H: "", D: "", C: "" } as Hand;
  for (const i of [...indices].sort((a, b) => a - b)) hand[SUITS[Math.floor(i / 13)]!] += RANKS[i % 13];
  return hand;
}

/**
 * How well a hand's original cards (what it holds now plus what it has played) fit what its bids
 * showed: 1 within the shown ranges; a third when no more than 2 HCP and a card per suit outside;
 * 0 further off.
 */
export function fitWeight(original: Card[], shown: Shown): number {
  let hcp = 0;
  const len = [0, 0, 0, 0];
  for (const c of original) {
    hcp += HCP[c.rank] ?? 0;
    len[SUITS.indexOf(c.suit)]!++;
  }
  const off = (v: number, [lo, hi]: [number, number]) => (v < lo ? lo - v : v > hi ? v - hi : 0);
  const hcpOff = off(hcp, shown.hcp);
  const lenOff = SUITS.map((s, i) => off(len[i]!, shown.len[s]));
  if (hcpOff === 0 && lenOff.every((d) => d === 0)) return 1;
  if (hcpOff <= 2 && lenOff.every((d) => d <= 1)) return 1 / 3;
  return 0;
}

/**
 * Deals of the cards the decider can't see, among the hidden seats: each seat gets as many as it
 * still holds, none in a suit it has shown out of, and each deal is weighted by how well the hidden
 * hands fit their bidding. `rand` makes it repeatable.
 */
export function sampleDeals(
  state: PlayState,
  who: Seat,
  shown: Record<Seat, Shown>,
  count: number,
  maxTries: number,
  rand: () => number,
  visible: Seat[] = [],
  /** Each side's agreements: when given, leads and signals seen so far weight the deals too. */
  systemFor?: (seat: Seat) => SystemSettings,
): WeightedDeal[] {
  const hidden = hiddenSeats(state, who, visible);
  const known = SEATS.filter((s) => !hidden.includes(s));
  if (hidden.length === 0) return [{ hands: state.hands, weight: 1 }];
  const pool = hidden.flatMap((s) => SUITS.flatMap((suit) => [...state.hands[s][suit]].map((rank) => cardIndex({ suit, rank }))));
  const sizes = hidden.map((s) => SUITS.reduce((n, suit) => n + state.hands[s][suit].length, 0));
  const out = voids(state);
  const played = playedBy(state);
  const deals: WeightedDeal[] = [];
  for (let tries = 0; tries < maxTries && deals.length < count; tries++) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    let at = 0;
    const split = sizes.map((n) => pool.slice(at, (at += n)));
    if (!hidden.every((s, k) => split[k]!.every((i) => !out[s].has(SUITS[Math.floor(i / 13)]!)))) continue;
    let weight = 1;
    for (let k = 0; k < hidden.length && weight > 0; k++) {
      weight *= fitWeight([...split[k]!.map(toCard), ...played[hidden[k]!]], shown[hidden[k]!]);
    }
    if (weight === 0) continue;
    const hands = { ...state.hands };
    hidden.forEach((s, k) => (hands[s] = handOf(split[k]!)));
    if (systemFor) weight *= cardingWeight(state, hands, who, known, systemFor);
    deals.push({ hands, weight });
  }
  return deals;
}
