// The bots' card decisions on this device, kept in memory for the play review: the owner's device
// works each one out as the bot plays, so the review needn't do it again. Lost on a reload, when the
// review works it out again (decisions are seeded, so the answer is the same).

import type { CardDecision, PlayContext } from "../core/cardplay/decide";
import { type PlayState, cardCode } from "../core/play";
import { SEATS, SUITS } from "../core/types";

const kept = new Map<string, CardDecision>();
/** Enough for several boards of bot cards; the oldest go first. */
const LIMIT = 400;

function keyOf(state: PlayState, ctx: PlayContext): string {
  const hands = SEATS.map((s) => SUITS.map((x) => state.hands[s][x]).join(".")).join(" ");
  const played = state.tricks.flatMap((t) => t.cards.map((p) => cardCode(p.card))).join(" ");
  return `${ctx.key}|${state.trump}|${state.declarer}|${hands}|${played}`;
}

export function rememberDecision(state: PlayState, ctx: PlayContext, decision: CardDecision) {
  kept.set(keyOf(state, ctx), decision);
  if (kept.size > LIMIT) kept.delete(kept.keys().next().value!);
}

export function recallDecision(state: PlayState, ctx: PlayContext): CardDecision | undefined {
  return kept.get(keyOf(state, ctx));
}
