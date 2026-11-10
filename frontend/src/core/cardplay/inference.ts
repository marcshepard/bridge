// Reading leads and signals: how well the cards played fit a sampled deal, by each player's side's
// agreements. A deal where the leader's fourth-best ♠5 leaves them three higher spades fits; one
// where it doesn't is unlikely. Partner nearly always tells the truth (a deal that doesn't fit their
// card counts a tenth). Opponents may false-card, and bots follow their conventions only between
// equally good cards, so an opponent's card is a light hint (a deal that doesn't fit counts 0.8).
//
// Read: the opening lead (the card the lead agreements give from the leader's holding; against
// notrump, usually a suit of four or more: a hint only), and the first card each player plays to
// a suit when following without trying to win: attitude when partner led it, count when declarer's
// side did.

import type { SystemSettings } from "../bidding/system";
import { type Card, type PlayState, dummyOf, rankValue } from "../play";
import { type Hand, type Seat, type Suit, partnerOf } from "../types";
import { leadCard } from "./carding";

const PARTNER_MISFIT = 0.1;
const OPPONENT_MISFIT = 0.8;
/** Against notrump, a lead from a short suit happens (partner's suit, a safe lead): only a hint. */
const SHORT_NT_LEAD = 0.6;

/** A suit's ranks high to low. */
const sortRanks = (ranks: string[]) => ranks.sort((a, b) => rankValue(b) - rankValue(a)).join("");

/**
 * The weight a deal gets from the leads and signals seen so far: 1 when every card fits it, less
 * for each that doesn't. `hands`: the deal's remaining cards; `who`: the bot doing the reading;
 * `known`: seats whose cards it already knows (their cards say nothing new).
 */
export function cardingWeight(state: PlayState, hands: Record<Seat, Hand>, who: Seat, known: Seat[], systemFor: (seat: Seat) => SystemSettings): number {
  // Each player's holding in each suit at the start: what they still hold plus what they've played.
  const played = new Map<string, string[]>();
  for (const t of state.tricks) for (const p of t.cards) played.set(`${p.seat}${p.card.suit}`, [...(played.get(`${p.seat}${p.card.suit}`) ?? []), p.card.rank]);
  const original = (seat: Seat, suit: Suit) => sortRanks([...hands[seat][suit], ...(played.get(`${seat}${suit}`) ?? [])]);

  let weight = 1;
  const misfit = (seat: Seat) => (weight *= seat === partnerOf(who) ? PARTNER_MISFIT : OPPONENT_MISFIT);
  const reads = (seat: Seat) => seat !== who && !known.includes(seat);
  const signalled = new Set<string>();
  const before = new Map<string, string[]>(); // cards of a suit each player has played so far, in order

  state.tricks.forEach((trick, t) => {
    let winner: Card | null = null;
    trick.cards.forEach((p, i) => {
      const key = `${p.seat}${p.card.suit}`;
      const holding = [...original(p.seat, p.card.suit)].filter((r) => !(before.get(key) ?? []).includes(r));
      const led = trick.cards[0]!.card;

      if (t === 0 && i === 0 && reads(p.seat)) {
        // The opening lead: the card the leader's agreements give from this holding.
        const s = systemFor(p.seat);
        const all = original(p.seat, p.card.suit);
        if (leadCard(all, s).rank !== p.card.rank) misfit(p.seat);
        if (state.trump === "NT" && all.length < 4 && !/^(AK|KQ|QJ|JT)/.test(all)) weight *= SHORT_NT_LEAD;
      } else if (i > 0 && p.card.suit === led.suit && reads(p.seat) && !signalled.has(key) && holding.length >= 2) {
        // Following suit, the first time in this suit, and not trying to win the trick: a signal.
        const tries = winner !== null && p.card.suit === winner.suit && rankValue(p.card.rank) > rankValue(winner.rank);
        signalled.add(key);
        if (!tries) {
          const s = systemFor(p.seat);
          const leader = trick.cards[0]!.seat;
          const high = p.card.rank !== holding[holding.length - 1];
          const declaring = leader === state.declarer || leader === dummyOf(state.declarer);
          const isDefender = p.seat !== state.declarer && p.seat !== dummyOf(state.declarer);
          if (isDefender && leader === partnerOf(p.seat)) {
            // Attitude: an honour left in the suit encourages.
            const want = holding.some((r) => r !== p.card.rank && "AKQ".includes(r));
            if (high !== (want === (s.attitude === "standard"))) misfit(p.seat);
          } else if (isDefender && declaring) {
            // Count: an even number of cards plays high first (standard).
            const even = original(p.seat, p.card.suit).length % 2 === 0;
            if (high !== (even === (s.count === "standard"))) misfit(p.seat);
          }
        }
      }
      before.set(key, [...(before.get(key) ?? []), p.card.rank]);
      // The card winning the trick so far (in the suit led; a trump beats it, but then nobody is following).
      if (!winner || (p.card.suit === winner.suit && rankValue(p.card.rank) > rankValue(winner.rank))) winner = p.card;
    });
  });
  return weight;
}
