// Which of several equal cards to play. Double dummy can't tell ♠Q from ♠J in ♠QJ, or which small
// card to discard, so sampling picks a group of equally good cards and these rules pick the card in
// it, by the side's agreements: leads (top of a sequence, A or K from AK, fourth best or third and
// fifth), signals (attitude when partner leads, count when declarer leads, the first discard).
// Declarer gives nothing away: the lowest card that does the job.

import type { SystemSettings } from "../bidding/system";
import { type Card, type PlayState, currentTrick, dummyOf, rankValue } from "../play";
import { type Seat, type Suit, RANKS, SUITS, partnerOf } from "../types";
import { playedBy } from "./sample";

const adjacent = (a: string, b: string) => Math.abs(RANKS.indexOf(a) - RANKS.indexOf(b)) === 1;
const HONOUR = "AKQJ";

/**
 * The card to lead from a suit (its ranks, high to low) by the leading agreements: A or K from AK;
 * the top of a sequence (KQ, QJ, J10, 109); the top of an interior sequence (KJ10: J); the top of a
 * doubleton; from length with an honour, fourth best (or third from an even number, lowest from
 * an odd); low from three to an honour; the top of three small.
 */
export function leadCard(ranks: string, s: SystemSettings): { rank: string; why: string } {
  const r = [...ranks];
  if (r.length === 0) throw new Error("No cards in that suit");
  if (r.length === 1) return { rank: r[0]!, why: "a singleton" };
  if (r[0] === "A" && r[1] === "K") return { rank: s.leadFromAk, why: `${s.leadFromAk} from AK (your lead agreement)` };
  if (adjacent(r[0]!, r[1]!) && "KQJT".includes(r[0]!)) return { rank: r[0]!, why: "the top of a sequence" };
  if (r.length >= 3 && "AKQ".includes(r[0]!) && adjacent(r[1]!, r[2]!) && "JT9".includes(r[1]!) && !adjacent(r[0]!, r[1]!)) {
    return { rank: r[1]!, why: "the top of an interior sequence" };
  }
  if (r.length === 2) return { rank: r[0]!, why: "the top of a doubleton" };
  const honour = r.some((x) => HONOUR.includes(x));
  if (r.length === 3) return honour ? { rank: r[2]!, why: "low from three to an honour" } : { rank: r[0]!, why: "the top of three small" };
  if (s.lengthLeads === "fourth") return { rank: r[3]!, why: "fourth best (your lead agreement)" };
  return r.length % 2 === 0
    ? { rank: r[2]!, why: "third best from an even number (your lead agreement)" }
    : { rank: r[r.length - 1]!, why: "lowest from an odd number (your lead agreement)" };
}

const highest = (cards: Card[]) => cards.reduce((a, b) => (rankValue(b.rank) > rankValue(a.rank) ? b : a));
const lowest = (cards: Card[]) => cards.reduce((a, b) => (rankValue(b.rank) < rankValue(a.rank) ? b : a));
const HCP: Record<string, number> = { A: 4, K: 3, Q: 2, J: 1 };
const suitHcp = (ranks: string) => [...ranks].reduce((n, r) => n + (HCP[r] ?? 0), 0);

/** The card of `group` nearest (in rank) to `rank` in `suit`. */
function nearest(group: Card[], suit: Suit, rank: string): Card {
  const inSuit = group.filter((c) => c.suit === suit);
  return inSuit.reduce((a, b) => (Math.abs(RANKS.indexOf(b.rank) - RANKS.indexOf(rank)) < Math.abs(RANKS.indexOf(a.rank) - RANKS.indexOf(rank)) ? b : a));
}

/**
 * Pick one card from a group the double-dummy analysis can't separate. `partnerSuits`: suits
 * partner has bid (an opening lead prefers them).
 */
export function chooseWithin(state: PlayState, mover: Seat, group: Card[], s: SystemSettings, partnerSuits: Suit[]): { card: Card; why: string } {
  if (group.length === 1) return { card: group[0]!, why: "" };
  const trick = currentTrick(state);
  const declaring = mover === state.declarer || mover === dummyOf(state.declarer);
  const hand = state.hands[mover];
  const suits = [...new Set(group.map((c) => c.suit))];

  // Leading.
  if (trick.cards.length === 0) {
    const opening = state.tricks.length === 1;
    if (declaring) return { card: lowest(group), why: "" };
    const suit =
      suits.find((x) => opening && partnerSuits.includes(x)) ??
      [...suits].sort((a, b) => hand[b].length - hand[a].length || SUITS.indexOf(a) - SUITS.indexOf(b))[0]!;
    const lead = leadCard(hand[suit], s);
    return { card: nearest(group, suit, lead.rank), why: lead.why };
  }

  const led = trick.cards[0]!.card.suit;
  // Following suit.
  if (suits.length === 1 && suits[0] === led) {
    if (declaring) return { card: lowest(group), why: "" };
    const ledByPartner = trick.cards[0]!.seat === partnerOf(mover);
    if (ledByPartner) {
      // Attitude: encourage with an honour left in the suit.
      const want = [...hand[led]].some((r) => "AKQ".includes(r));
      const high = want === (s.attitude === "standard");
      return { card: high ? highest(group) : lowest(group), why: `attitude: ${want ? "encouraging" : "discouraging"} (your signals)` };
    }
    // Count, when declarer's side leads: even or odd number of cards (held at the start).
    const length = hand[led].length + playedBy(state)[mover].filter((c) => c.suit === led).length;
    const even = length % 2 === 0;
    const high = even === (s.count === "standard");
    return { card: high ? highest(group) : lowest(group), why: `count: ${even ? "an even" : "an odd"} number (your signals)` };
  }

  // Discarding: from the weakest suit, a card that says "not this one".
  const weakest = [...suits].sort((a, b) => suitHcp(hand[a]) - suitHcp(hand[b]) || hand[b].length - hand[a].length)[0]!;
  const inSuit = group.filter((c) => c.suit === weakest);
  if (declaring) return { card: lowest(inSuit), why: "" };
  const discourage = s.attitude === "standard" ? lowest(inSuit) : highest(inSuit);
  return { card: discourage, why: "a discard that discourages this suit (your signals)" };
}
