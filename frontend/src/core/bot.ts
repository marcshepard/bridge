// A simple robot for the seats nobody is playing. A few textbook rules, so it plays badly but not
// absurdly: second hand low, third hand high, win cheaply in fourth seat, ruff low, discard from
// the shortest suit, and some standard leads. Everything else is random.

import {
  type Card,
  type PlayState,
  cardsOf,
  currentTrick,
  dummyOf,
  legalCards,
  nextSeat,
  rankValue,
  toPlay,
  trickWinner,
} from "./play";
import { type Seat, type Suit, SUITS, partnerOf } from "./types";

const HONOUR_POINTS: Record<string, number> = { A: 4, K: 3, Q: 2, J: 1 };

function suitPoints(ranks: string): number {
  return [...ranks].reduce((n, r) => n + (HONOUR_POINTS[r] ?? 0), 0);
}

const highest = (cards: Card[]) => cards.reduce((a, b) => (rankValue(b.rank) > rankValue(a.rank) ? b : a));
const lowest = (cards: Card[]) => cards.reduce((a, b) => (rankValue(b.rank) < rankValue(a.rank) ? b : a));

/** Does `card` beat the trick's current winner? */
function beats(card: Card, winner: Card, trump: string): boolean {
  if (card.suit === winner.suit) return rankValue(card.rank) > rankValue(winner.rank);
  return card.suit === trump;
}

/** The card the robot plays for whoever's turn it is. `rand` is injectable for tests. */
export function chooseCard(state: PlayState, rand: () => number = Math.random): Card {
  return currentTrick(state).cards.length === 0 ? chooseLead(state, rand) : chooseFollow(state);
}

function chooseFollow(state: PlayState): Card {
  const seat = toPlay(state);
  const trick = currentTrick(state);
  const legal = legalCards(state, seat);
  const led = trick.cards[0]!.card.suit;
  const winning = trickWinner(trick, state.trump)!;
  const partnerWinning = winning.seat === partnerOf(seat);
  const winners = legal.filter((c) => beats(c, winning.card, state.trump));

  if (legal[0]!.suit === led) {
    const position = trick.cards.length + 1; // 2nd, 3rd or 4th hand
    // Third hand still plays high over partner's small card; a queen or better is left to win.
    const leaveToPartner = partnerWinning && (position === 4 || rankValue(winning.card.rank) >= rankValue("Q"));
    if (leaveToPartner || winners.length === 0 || position === 2) return lowest(legal);
    // Third hand high; fourth hand wins as cheaply as it can.
    return position === 3 ? highest(winners) : lowest(winners);
  }

  // Can't follow: ruff as low as will win (unless partner has it), else throw the lowest card from
  // the shortest other suit.
  const ruffs = winners.filter((c) => c.suit === state.trump);
  if (!partnerWinning && ruffs.length > 0) return lowest(ruffs);
  const hand = state.hands[seat];
  const others = SUITS.filter((s) => s !== state.trump && hand[s].length > 0);
  if (others.length === 0) return lowest(legal);
  const shortest = others.reduce((a, b) => (hand[b].length < hand[a].length ? b : a));
  return lowest(legal.filter((c) => c.suit === shortest));
}

function chooseLead(state: PlayState, rand: () => number): Card {
  const seat = toPlay(state);
  const hand = state.hands[seat];
  const defending = seat !== state.declarer && seat !== dummyOf(state.declarer);
  const fromSuit = (suit: Suit, pick: (cards: Card[]) => Card) =>
    pick([...hand[suit]].map((rank) => ({ suit, rank })));

  if (defending && state.tricks.length === 1) return openingLead(state, seat) ?? randomLead(state, seat, rand);

  if (defending) {
    // Return partner's suit: top from a doubleton, else low.
    const partnerLed = state.tricks.filter((t) => t.leader === partnerOf(seat) && t.cards.length > 0).at(-1);
    const suit = partnerLed?.cards[0]!.card.suit;
    if (suit && hand[suit].length > 0) return fromSuit(suit, hand[suit].length <= 2 ? highest : lowest);

    // Through dummy's strength when dummy plays after you, up to its weakness when it plays last.
    const dummy = dummyOf(state.declarer);
    const dummyHand = state.hands[dummy];
    const candidates = SUITS.filter((s) => s !== state.trump && hand[s].length > 0 && dummyHand[s].length > 0);
    if (candidates.length > 0 && (nextSeat(seat) === dummy || nextSeat(dummy) === seat)) {
      const strong = nextSeat(seat) === dummy;
      const target = candidates.reduce((a, b) =>
        strong ? (suitPoints(dummyHand[b]) > suitPoints(dummyHand[a]) ? b : a) : suitPoints(dummyHand[b]) < suitPoints(dummyHand[a]) ? b : a,
      );
      return fromSuit(target, lowest);
    }
  }

  return randomLead(state, seat, rand);
}

/** Two touching honours at the top of a suit, e.g. "KQ5" or "AKJ3". */
const SEQUENCE_TOPS = ["AK", "KQ", "QJ", "JT"];

function openingLead(state: PlayState, seat: Seat): Card | null {
  const hand = state.hands[seat];
  const top = (suit: Suit): Card => ({ suit, rank: hand[suit][0]! });

  if (state.trump === "NT") {
    // Fourth from the longest suit (the stronger of two the same length), or the top of a sequence.
    const suit = SUITS.reduce((a, b) =>
      hand[b].length > hand[a].length || (hand[b].length === hand[a].length && suitPoints(hand[b]) > suitPoints(hand[a])) ? b : a,
    );
    if (/^(AKQ|KQJ|QJT|JT9)/.test(hand[suit])) return top(suit);
    return { suit, rank: hand[suit][Math.min(3, hand[suit].length - 1)]! };
  }

  // Against a suit: top of a sequence, else an ace (never from trumps).
  const sideSuits = SUITS.filter((s) => s !== state.trump && hand[s].length > 0);
  const sequence = sideSuits.find((s) => SEQUENCE_TOPS.some((t) => hand[s].startsWith(t)));
  if (sequence) return top(sequence);
  const ace = sideSuits.find((s) => hand[s].startsWith("A"));
  return ace ? top(ace) : null;
}

/** A low card from a random suit, preferring side suits for the defenders. */
function randomLead(state: PlayState, seat: Seat, rand: () => number): Card {
  const hand = state.hands[seat];
  const held = SUITS.filter((s) => hand[s].length > 0);
  const side = held.filter((s) => s !== state.trump);
  const pool = side.length > 0 && seat !== state.declarer && seat !== dummyOf(state.declarer) ? side : held;
  const suit = pool[Math.floor(rand() * pool.length)] ?? held[0]!;
  return lowest(cardsOf(hand).filter((c) => c.suit === suit));
}
