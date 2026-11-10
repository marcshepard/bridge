// The bots' card play: deal the hands the bot can't see, many times, keeping deals that fit what it
// knows (weighted, so light bidding is allowed for); solve every legal card on each deal with double
// dummy; play the group of cards that's best on the most deals (matchpoints), ties broken by average
// tricks; then pick the card in the group by the side's leads and signals. Repeatable (seeded), so
// the play review can run a decision again. Without a solver, the simple rules in core/bot.ts.

import { chooseCard } from "../bot";
import { type Card, type PlayState, cardCode, currentTrick, legalCards, toPlay } from "../play";
import type { DoubleDummySolver } from "../doubleDummy";
import { hash, seeded } from "../random";
import { type Seat, type Suit, SUITS } from "../types";
import type { Shown } from "../bidding/model";
import type { SystemSettings } from "../bidding/system";
import { chooseWithin } from "./carding";
import { decider, sampleDeals } from "./sample";
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
}

const RANK_WORDS = "AKQJT98765432";
const cardText = (c: Card) => `${({ S: "♠", H: "♥", D: "♦", C: "♣" } as const)[c.suit]}${c.rank === "T" ? "10" : c.rank}`;

/** The bot's card for whoever is to play (declarer decides for dummy). */
export async function decideCard(state: PlayState, ctx: PlayContext, solver: DoubleDummySolver | null, options: CardPlayOptions = {}): Promise<CardDecision> {
  const mover = toPlay(state);
  const who = decider(state, mover);
  const legal = legalCards(state, mover);
  if (legal.length === 1) return { card: legal[0]!, reason: "the only card it can play" };
  if (!solver) return { card: chooseCard(state), reason: "by simple rules (double dummy isn't available on this device)" };

  const trick = currentTrick(state);
  const played = state.tricks.flatMap((t) => t.cards.map((p) => cardCode(p.card))).join(" ");
  const mine = SUITS.map((s) => state.hands[who][s]).join(".");
  const rand = seeded(hash(`${mine}|${played}|${ctx.key}`));
  const count = options.deals ?? 40;
  let deals = sampleDeals(state, who, ctx.shown, count, options.maxTries ?? 20_000, rand, [], ctx.readCarding === false ? undefined : ctx.systemFor);
  let note = "";
  if (deals.length < 6) {
    // The bidding and the play don't fit together well (a misread call, a wild bid): use the hard facts only.
    const unknown = { N: unknownHand(), E: unknownHand(), S: unknownHand(), W: unknownHand() };
    deals = sampleDeals(state, who, unknown, count, options.maxTries ?? 20_000, rand, [], ctx.readCarding === false ? undefined : ctx.systemFor);
    note = " (the bidding didn't fit the cards seen, so only the cards played were used)";
  }
  if (deals.length === 0) return { card: chooseCard(state), reason: "by simple rules (no deal fitted what it knows)" };

  const scores = await solver.cards(
    deals.map((d) => ({ hands: d.hands, trump: state.trump, leader: trick.leader, trick: trick.cards.map((p) => p.card) })),
  );

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

  // An opening lead within a whisker of the best, in partner's suit, is preferred.
  let chosen = groups[0]!;
  const partnerSuits = ctx.bidSuits[({ N: "S", S: "N", E: "W", W: "E" } as const)[mover]];
  if (state.tricks.length === 1 && trick.cards.length === 0) {
    const partners = groups.find((g) => g.cards.some((c) => partnerSuits.includes(c.suit)));
    if (partners && partners !== chosen && chosen.best - partners.best <= 0.03 && chosen.average - partners.average <= 0.1) chosen = partners;
  }
  const pick = chooseWithin(state, mover, chosen.cards, ctx.systemFor(mover), partnerSuits);
  const pct = Math.round(chosen.best * 100);
  const others = chosen.cards.length > 1 ? ` (or its equals: ${chosen.cards.filter((c) => cardCode(c) !== cardCode(pick.card)).sort((a, b) => RANK_WORDS.indexOf(a.rank) - RANK_WORDS.indexOf(b.rank)).map(cardText).join(" ")})` : "";
  return {
    card: pick.card,
    reason: `in ${deals.length} deals that fit what it knows${note}, ${cardText(pick.card)}${others} was best on ${pct}%, for ${chosen.average.toFixed(1)} tricks on average${pick.why ? `; this card of the equals: ${pick.why}` : ""}`,
    simulation: { deals: deals.length, groups },
  };
}
