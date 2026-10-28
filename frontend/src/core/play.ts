// Card play: whose turn it is, which cards may be played, and who wins each trick.
// Pure functions over an immutable state, so the screen (and later the backend) can replay a hand.

import { type Hand, type Seat, type Strain, type Suit, RANKS, SEATS, SUITS, partnerOf } from "./types";

export interface Card {
  suit: Suit;
  rank: string; // one of RANKS; "T" is the ten
}

export interface PlayedCard {
  seat: Seat;
  card: Card;
}

/** One trick: who led it, and the cards in the order they were played. */
export interface Trick {
  leader: Seat;
  cards: PlayedCard[];
}

export interface PlayState {
  /** The cards each seat still holds. */
  hands: Record<Seat, Hand>;
  trump: Strain;
  declarer: Seat;
  /** Every trick so far, the last one possibly unfinished. */
  tricks: Trick[];
}

export function nextSeat(seat: Seat): Seat {
  return SEATS[(SEATS.indexOf(seat) + 1) % 4]!;
}

export function dummyOf(declarer: Seat): Seat {
  return partnerOf(declarer);
}

/** The opening leader is declarer's left-hand opponent. */
export function startPlay(hands: Record<Seat, Hand>, trump: Strain, declarer: Seat): PlayState {
  return { hands, trump, declarer, tricks: [{ leader: nextSeat(declarer), cards: [] }] };
}

/** Higher is better; works for comparing ranks within one suit. */
export function rankValue(rank: string): number {
  return RANKS.length - RANKS.indexOf(rank);
}

export function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function cardsOf(hand: Hand): Card[] {
  return SUITS.flatMap((suit) => [...hand[suit]].map((rank) => ({ suit, rank })));
}

export function currentTrick(state: PlayState): Trick {
  return state.tricks.at(-1)!;
}

export function isComplete(state: PlayState): boolean {
  return state.tricks.length === 13 && currentTrick(state).cards.length === 4;
}

/** Whose turn it is (declarer plays dummy's cards, but the turn is still dummy's seat). */
export function toPlay(state: PlayState): Seat {
  const t = currentTrick(state);
  let seat = t.leader;
  for (let i = 0; i < t.cards.length; i++) seat = nextSeat(seat);
  return seat;
}

/** The cards `seat` may play now: any card when leading, else follow suit if you can. */
export function legalCards(state: PlayState, seat: Seat): Card[] {
  const hand = state.hands[seat];
  const led = currentTrick(state).cards[0]?.card.suit;
  if (led && hand[led].length > 0) return [...hand[led]].map((rank) => ({ suit: led, rank }));
  return cardsOf(hand);
}

/** Whoever is winning the trick so far: the highest trump, else the highest card of the suit led. */
export function trickWinner(trick: Trick, trump: Strain): PlayedCard | null {
  let best: PlayedCard | null = null;
  for (const p of trick.cards) {
    if (!best) best = p;
    else if (p.card.suit === best.card.suit) {
      if (rankValue(p.card.rank) > rankValue(best.card.rank)) best = p;
    } else if (p.card.suit === trump) best = p;
  }
  return best;
}

/** Plays a card for whoever's turn it is. Throws if it isn't theirs to play. */
export function playCard(state: PlayState, card: Card): PlayState {
  if (isComplete(state)) throw new Error("The hand is over");
  const seat = toPlay(state);
  if (!legalCards(state, seat).some((c) => sameCard(c, card))) throw new Error("That card can't be played now");
  const hand = { ...state.hands[seat], [card.suit]: state.hands[seat][card.suit].replace(card.rank, "") };
  const trick = { ...currentTrick(state), cards: [...currentTrick(state).cards, { seat, card }] };
  const tricks = [...state.tricks.slice(0, -1), trick];
  // A finished trick: its winner leads the next one.
  if (trick.cards.length === 4 && tricks.length < 13) tricks.push({ leader: trickWinner(trick, state.trump)!.seat, cards: [] });
  return { ...state, hands: { ...state.hands, [seat]: hand }, tricks };
}

/** The finished tricks, newest last. */
export function finishedTricks(state: PlayState): Trick[] {
  return state.tricks.filter((t) => t.cards.length === 4);
}

/** Tricks won so far by declarer's side and by the defenders. */
export function tricksWon(state: PlayState): { declarer: number; defence: number } {
  let declarer = 0;
  for (const t of finishedTricks(state)) {
    const w = trickWinner(t, state.trump)!.seat;
    if (w === state.declarer || w === dummyOf(state.declarer)) declarer++;
  }
  return { declarer, defence: finishedTricks(state).length - declarer };
}

/** "SA", "HT": suit then rank, as cards are stored and sent. */
export function cardCode(card: Card): string {
  return card.suit + card.rank;
}

/** The reverse of `cardCode`; null for anything that isn't a card. */
export function parseCard(text: string): Card | null {
  const m = /^([SHDC])([AKQJT98765432])$/.exec(text.trim().toUpperCase());
  return m ? { suit: m[1] as Suit, rank: m[2]! } : null;
}

/** The position after the given cards (in order) are played. Throws at the first illegal card. */
export function replay(hands: Record<Seat, Hand>, trump: Strain, declarer: Seat, cards: Card[]): PlayState {
  return cards.reduce(playCard, startPlay(hands, trump, declarer));
}

/** Tricks still to be won: the unfinished one counts. */
export function tricksLeft(state: PlayState): number {
  return 13 - finishedTricks(state).length;
}

/** A claim: `seat` says their side will take `tricks` of the tricks still to play. */
export interface Claim {
  seat: Seat;
  tricks: number;
  /** Who has accepted it so far. */
  acceptedBy: Seat[];
}

/** Who answers a claim: the claimer's opponents, except dummy (declarer answers for that side). */
export function claimAnswerers(claimer: Seat, declarer: Seat): Seat[] {
  return SEATS.filter((s) => s !== claimer && s !== partnerOf(claimer) && s !== dummyOf(declarer));
}

export function claimAccepted(claim: Claim, declarer: Seat): boolean {
  return claimAnswerers(claim.seat, declarer).every((s) => claim.acceptedBy.includes(s));
}

/**
 * Declarer's tricks once play is over (every card played, or a claim accepted); null until then.
 * A claim gives the claimer's side what they claimed of the tricks left, and the rest to the others.
 */
export function finalTricks(state: PlayState, claim: Claim | null): number | null {
  const won = tricksWon(state).declarer;
  if (claim && claimAccepted(claim, state.declarer)) {
    const declarerSide = claim.seat === state.declarer || claim.seat === dummyOf(state.declarer);
    return won + (declarerSide ? claim.tricks : tricksLeft(state) - claim.tricks);
  }
  return isComplete(state) ? won : null;
}
