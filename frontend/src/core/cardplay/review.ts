// The play review: each card of a finished board, judged on the odds from the seat that chose it,
// not on how it turned out. A card is compared with the others on deals of the hidden hands that fit
// what its player could know (the same sampling the bots play by), then checked on the real deal,
// which tells bad luck from a bad play:
//
//   mistake:     another card was best on at least 10% more of the deals
//   close call:  another card was best on 1% to 10% more, and clearly so (more than the noise)
//   unlucky:     the card was the best play, but on the real deal it cost a trick
//
// Two passes: 40 deals (the bot's own decision), then 200 for a card behind the best by less than
// 10%, where a small difference needs more deals to show. "Best" is the bots' measure: the most
// tricks on the deal (matchpoints). See docs/BOT.md, stage 5.

import type { DoubleDummySolver } from "../doubleDummy";
import { type Card, type PlayState, cardCode, currentTrick, legalCards, toPlay } from "../play";
import { type CardDecision, type CardGroup, type CardSimulation, type PlayContext, decideCard, simulateCards } from "./decide";

export type PlayMark = "mistake" | "close" | "unlucky";

/** How far behind the best card (share of deals) makes a mistake, and a close call. */
export const MISTAKE_GAP = 0.1;
export const CLOSE_GAP = 0.01;
const FIRST_DEALS = 40;
const SECOND_DEALS = 200;

/** The odds from the player's seat: their card's group, the best group, and how far apart. */
export interface CardOdds {
  deals: number;
  groups: CardGroup[];
  yours: CardGroup;
  best: CardGroup;
  /** The best group's share less yours (0 when yours is the best). */
  gap: number;
  /** The gap is clearly more than the sampling's noise (twice its standard error). */
  clear: boolean;
}

/** One legal card on the real deal and the tricks its side takes from there with perfect play. */
export interface ActualCard {
  card: Card;
  tricks: number;
}

export interface CardReview {
  card: Card;
  /** No choice: the only legal card, or all legal cards equal on every deal. */
  forced: boolean;
  mark: PlayMark | null;
  /** The bot's decision from the same seat: what it would have played, and why. */
  bot: CardDecision;
  odds: CardOdds | null;
  /** The real deal: each legal card's tricks, best first; and the tricks this card cost. */
  actual: ActualCard[];
  cost: number;
  /** Behind the best, but by less than 1% or within the noise: no mark, but worth saying. */
  tooClose: boolean;
}

/** The odds for `card` from a simulation: its group against the best, and whether the gap is clear. */
export function oddsOf(sim: CardSimulation, card: Card): CardOdds | null {
  const yours = sim.groups.find((g) => g.cards.some((c) => cardCode(c) === cardCode(card)));
  const best = sim.groups[0];
  if (!yours || !best) return null;
  const gap = best.best - yours.best;
  // On each deal, 1 if the best group's card is best and yours isn't, -1 the other way round, else
  // 0. The same deals for both, so most of the noise cancels.
  const a = cardCode(best.cards[0]!);
  const b = cardCode(yours.cards[0]!);
  let sumSq = 0;
  sim.perDeal.forEach((row, i) => {
    const w = sim.deals[i]!.weight;
    const max = Math.max(...row.values());
    const x = (row.get(a) === max ? 1 : 0) - (row.get(b) === max ? 1 : 0);
    sumSq += w * w * (x - gap) ** 2;
  });
  const se = Math.sqrt(sumSq) / sim.total;
  return { deals: sim.deals.length, groups: sim.groups, yours, best, gap, clear: gap > 0 && gap >= 2 * se };
}

/** The mark from the odds and the trick the card cost on the real deal. */
export function markFor(odds: CardOdds | null, cost: number): { mark: PlayMark | null; tooClose: boolean } {
  if (!odds || odds.gap <= 0) return { mark: cost > 0 ? "unlucky" : null, tooClose: false };
  if (odds.gap >= MISTAKE_GAP) return { mark: "mistake", tooClose: false };
  if (odds.gap >= CLOSE_GAP && odds.clear) return { mark: "close", tooClose: false };
  return { mark: null, tooClose: true };
}

/** Each legal card on the real deal with its side's tricks from there, best first. */
async function actualCards(state: PlayState, solver: DoubleDummySolver): Promise<ActualCard[]> {
  const trick = currentTrick(state);
  const [row] = await solver.cards([{ hands: state.hands, trump: state.trump, leader: trick.leader, trick: trick.cards.map((p) => p.card) }]);
  return [...(row ?? [])].sort((x, y) => y.tricks - x.tricks);
}

/**
 * Review the card played from `state` (the position before it). `judge`: it's the reviewed
 * player's card, so it gets the second pass and a mark; otherwise only the bot's reason and the
 * figures. `known`: the bot's decision from the table, when this device kept it.
 */
export async function reviewCard(
  state: PlayState,
  card: Card,
  ctx: PlayContext,
  solver: DoubleDummySolver,
  judge: boolean,
  known?: CardDecision,
): Promise<CardReview> {
  const legal = legalCards(state, toPlay(state));
  if (legal.length === 1) {
    return { card, forced: true, mark: null, bot: known ?? { card, reason: "the only card it can play" }, odds: null, actual: [], cost: 0, tooClose: false };
  }
  // The first pass is also the bot's own decision (seeded: the same deals as at the table).
  let sim = await simulateCards(state, ctx, solver, FIRST_DEALS);
  const bot = known ?? (await decideCard(state, ctx, solver, { simulation: sim }));
  const actual = await actualCards(state, solver);
  const max = actual[0]?.tricks ?? 0;
  const cost = max - (actual.find((a) => cardCode(a.card) === cardCode(card))?.tricks ?? max);
  if (!sim || sim.groups.length === 1) return { card, forced: true, mark: null, bot, odds: null, actual, cost, tooClose: false };

  let odds = oddsOf(sim, card);
  // The bot's own choice is never marked: it can differ from the top group on a near tie (an
  // opening lead in partner's suit).
  if (odds && odds.yours.cards.some((c) => cardCode(c) === cardCode(bot.card))) odds = { ...odds, gap: 0, clear: false };
  if (judge && odds && odds.gap > 0 && odds.gap < MISTAKE_GAP) {
    sim = await simulateCards(state, ctx, solver, SECOND_DEALS);
    odds = sim ? oddsOf(sim, card) : odds;
  }
  const { mark, tooClose } = judge ? markFor(odds, cost) : { mark: null, tooClose: false };
  return { card, forced: false, mark, bot, odds, actual, cost, tooClose };
}
