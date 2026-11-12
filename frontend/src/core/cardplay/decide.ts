// The bots' card play: deal the hands the bot can't see, many times, keeping deals that fit what it
// knows (weighted, so light bidding is allowed for); solve every legal card on each deal with double
// dummy; play the group of cards that's best on the most deals (matchpoints), ties broken by average
// tricks; then pick the card in the group by the side's leads and signals. Two opening-lead
// preferences: from AK against a suit contract unless another lead is clearly better (AK_LEAD_MARGIN),
// then partner's suit on a near tie. Repeatable (seeded), so
// the play review can run a decision again. Without a solver, the simple rules in core/bot.ts.

import { chooseCard } from "../bot";
import { type Card, type PlayState, cardCode, currentTrick, legalCards, toPlay } from "../play";
import type { DoubleDummySolver } from "../doubleDummy";
import { hash, seeded } from "../random";
import { type Seat, type Suit, SUITS } from "../types";
import type { Shown } from "../bidding/model";
import type { SystemSettings } from "../bidding/system";
import { chooseWithin } from "./carding";
import { type WeightedDeal, decider, sampleDeals } from "./sample";
import { unknownHand } from "../bidding/model";

/** What the bidding said, for the play: what each hand showed, and the suits each seat bid naturally. */
export interface PlayContext {
  shown: Record<Seat, Shown>;
  bidSuits: Record<Seat, Suit[]>;
  /** The card each seat's side signals and leads by. */
  systemFor: (seat: Seat) => SystemSettings;
  /** Mixed into the seed: the auction, so different auctions on the same cards deal differently. */
  key: string;
  /** Read leads and signals as information (on unless turned off, for comparisons). */
  readCarding?: boolean;
}

export interface CardGroup {
  cards: Card[];
  /** Share of the (weighted) deals on which these cards are the best, 0–1. */
  best: number;
  /** Average tricks for the mover's side from here. */
  average: number;
}

export interface CardDecision {
  card: Card;
  /** Why, in a learner's words. */
  reason: string;
  /** The simulation behind it, when there was one: the deals, and each group of equal cards. */
  simulation?: { deals: number; groups: CardGroup[] };
}

export interface CardPlayOptions {
  deals?: number;
  maxTries?: number;
  /** A simulation already run for this position (the play review's), so it isn't run twice. */
  simulation?: CardSimulation | null;
}

const RANK_WORDS = "AKQJT98765432";
const cardText = (c: Card) => `${({ S: "♠", H: "♥", D: "♦", C: "♣" } as const)[c.suit]}${c.rank === "T" ? "10" : c.rank}`;

/**
 * The deals the decider can't rule out, and every legal card solved on each: what both the bot's
 * choice and the play review work from. `perDeal[i]` maps a card's code to the tricks the mover's
 * side takes with it on deal i. Null when nothing fitted.
 */
export interface CardSimulation {
  deals: WeightedDeal[];
  total: number;
  perDeal: Map<string, number>[];
  groups: CardGroup[];
  /** Said when the bidding had to be ignored. */
  note: string;
}

/** Deal the hidden hands from the decider's seat, solve every legal card on each, and group equal cards. */
export async function simulateCards(state: PlayState, ctx: PlayContext, solver: DoubleDummySolver, count = 40, maxTries = 20_000): Promise<CardSimulation | null> {
  const mover = toPlay(state);
  const who = decider(state, mover);
  const legal = legalCards(state, mover);
  const trick = currentTrick(state);
  const played = state.tricks.flatMap((t) => t.cards.map((p) => cardCode(p.card))).join(" ");
  const mine = SUITS.map((s) => state.hands[who][s]).join(".");
  const rand = seeded(hash(`${mine}|${played}|${ctx.key}`));
  const carding = ctx.readCarding === false ? undefined : ctx.systemFor;
  let deals = sampleDeals(state, who, ctx.shown, count, maxTries, rand, [], carding);
  let note = "";
  if (deals.length < 6) {
    // The bidding and the play don't fit together well (a misread call, a wild bid): use the hard facts only.
    const unknown = { N: unknownHand(), E: unknownHand(), S: unknownHand(), W: unknownHand() };
    deals = sampleDeals(state, who, unknown, count, maxTries, rand, [], carding);
    note = " (the bidding didn't fit the cards seen, so only the cards played were used)";
  }
  if (deals.length === 0) return null;

  const scores = await solver.cards(
    deals.map((d) => ({ hands: d.hands, trump: state.trump, leader: trick.leader, trick: trick.cards.map((p) => p.card) })),
  );
  const perDeal = scores.map((row) => new Map(row.map((r) => [cardCode(r.card), r.tricks])));

  // Per card: weighted share of deals where it's best, and average tricks; group cards that score
  // the same on every deal (double dummy can't tell them apart).
  const total = deals.reduce((n, d) => n + d.weight, 0);
  const byCard = new Map<string, { card: Card; best: number; sum: number; signature: string }>();
  for (const c of legal) byCard.set(cardCode(c), { card: c, best: 0, sum: 0, signature: "" });
  scores.forEach((row, i) => {
    const w = deals[i]!.weight;
    const max = Math.max(...row.map((r) => r.tricks));
    for (const r of row) {
      const e = byCard.get(cardCode(r.card));
      if (!e) continue;
      e.sum += w * r.tricks;
      if (r.tricks === max) e.best += w;
      e.signature += `${r.tricks},`;
    }
  });
  const groupsBySig = new Map<string, Card[]>();
  for (const e of byCard.values()) groupsBySig.set(e.signature, [...(groupsBySig.get(e.signature) ?? []), e.card]);
  const groups: CardGroup[] = [...groupsBySig.values()]
    .map((cards) => {
      const e = byCard.get(cardCode(cards[0]!))!;
      return { cards, best: e.best / total, average: e.sum / total };
    })
    .sort((a, b) => b.best - a.best || b.average - a.average);
  return { deals, total, perDeal, groups, note };
}

/**
 * How far behind the best lead (share of deals) a lead from AK can be and still be chosen. Double
 * dummy gives no credit for what the lead lets you see: every simulated defender sees all the cards
 * and finds the right switch at trick 2 anyway. Cashing a top card and looking at dummy first is
 * worth more than that, so it's preferred unless another lead is clearly better.
 */
export const AK_LEAD_MARGIN = 0.1;

/**
 * Opening leads from AK in a side suit, against a suit contract, within AK_LEAD_MARGIN of the best
 * group: each AK suit with its best group (the one holding its A or K), best first.
 */
export function akLeads(state: PlayState, groups: CardGroup[]): { suit: Suit; group: CardGroup }[] {
  const trick = currentTrick(state);
  if (state.trump === "NT" || state.tricks.length !== 1 || trick.cards.length > 0 || !groups[0]) return [];
  const hand = state.hands[toPlay(state)];
  const out: { suit: Suit; group: CardGroup }[] = [];
  for (const suit of SUITS) {
    if (suit === state.trump || !hand[suit].startsWith("AK")) continue;
    const group = groups.find((g) => g.cards.some((c) => c.suit === suit && (c.rank === "A" || c.rank === "K")));
    if (group && groups[0].best - group.best <= AK_LEAD_MARGIN) out.push({ suit, group });
  }
  return out.sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group));
}

/** The bot's card for whoever is to play (declarer decides for dummy). */
export async function decideCard(state: PlayState, ctx: PlayContext, solver: DoubleDummySolver | null, options: CardPlayOptions = {}): Promise<CardDecision> {
  const mover = toPlay(state);
  const legal = legalCards(state, mover);
  if (legal.length === 1) return { card: legal[0]!, reason: "the only card it can play" };
  if (!solver) return { card: chooseCard(state), reason: "by simple rules (double dummy isn't available on this device)" };

  const trick = currentTrick(state);
  const sim = options.simulation !== undefined ? options.simulation : await simulateCards(state, ctx, solver, options.deals ?? 40, options.maxTries ?? 20_000);
  if (!sim) return { card: chooseCard(state), reason: "by simple rules (no deal fitted what it knows)" };
  const { deals, groups, note } = sim;

  let chosen = groups[0]!;
  let because = "";
  const partnerSuits = ctx.bidSuits[({ N: "S", S: "N", E: "W", W: "E" } as const)[mover]];
  const ak = akLeads(state, groups)[0];
  if (ak) {
    // Lead from AK against a suit contract: see dummy before choosing what to do next.
    if (ak.group !== chosen) because = `; it leads from AK to see dummy before choosing what to do next`;
    chosen = { ...ak.group, cards: ak.group.cards.filter((c) => c.suit === ak.suit) };
  } else if (state.tricks.length === 1 && trick.cards.length === 0) {
    // An opening lead within a whisker of the best, in partner's suit, is preferred.
    const partners = groups.find((g) => g.cards.some((c) => partnerSuits.includes(c.suit)));
    if (partners && partners !== chosen && chosen.best - partners.best <= 0.03 && chosen.average - partners.average <= 0.1) chosen = partners;
  }
  const pick = chooseWithin(state, mover, chosen.cards, ctx.systemFor(mover), partnerSuits);
  const pct = Math.round(chosen.best * 100);
  const others = chosen.cards.length > 1 ? ` (or its equals: ${chosen.cards.filter((c) => cardCode(c) !== cardCode(pick.card)).sort((a, b) => RANK_WORDS.indexOf(a.rank) - RANK_WORDS.indexOf(b.rank)).map(cardText).join(" ")})` : "";
  return {
    card: pick.card,
    reason: `in ${deals.length} deals that fit what it knows${note}, ${cardText(pick.card)}${others} was best on ${pct}%, for ${chosen.average.toFixed(1)} tricks on average${because}${pick.why ? `; this card of the equals: ${pick.why}` : ""}`,
    simulation: { deals: deals.length, groups },
  };
}
