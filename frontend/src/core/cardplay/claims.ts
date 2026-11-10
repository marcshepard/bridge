// Claims, for the bots. A bot answers a claim by checking it on deals from its own view (the
// claimer's hand is shown, so it's known): it accepts if the claimer's side takes the tricks
// claimed on every deal, playing perfectly; otherwise it refuses. A bot claims when its side's
// tricks from here are the same on every deal: there's nothing left to play for.

import type { DoubleDummySolver } from "../doubleDummy";
import { type Claim, type PlayState, currentTrick, toPlay, tricksLeft } from "../play";
import { hash, seeded } from "../random";
import { type Seat, directionOf } from "../types";
import type { PlayContext } from "./decide";
import { decider, sampleDeals } from "./sample";

const DEALS = 24;

/** The tricks the side of `seat` takes from here (the unfinished trick included), on each deal. */
async function sideTricks(state: PlayState, seat: Seat, deals: { hands: PlayState["hands"] }[], solver: DoubleDummySolver): Promise<number[]> {
  const trick = currentTrick(state);
  const mover = toPlay(state);
  const rows = await solver.cards(deals.map((d) => ({ hands: d.hands, trump: state.trump, leader: trick.leader, trick: trick.cards.map((p) => p.card) })));
  const left = tricksLeft(state);
  return rows.map((row) => {
    const best = Math.max(...row.map((r) => r.tricks));
    return directionOf(mover) === directionOf(seat) ? best : left - best;
  });
}

const seedOf = (state: PlayState, ctx: PlayContext, extra: string) =>
  seeded(hash(`${extra}|${state.tricks.flatMap((t) => t.cards.map((p) => p.card.suit + p.card.rank)).join(" ")}|${ctx.key}`));

/** Should `seat` (a bot, answering) accept this claim? */
export async function checkClaim(state: PlayState, claim: Claim, seat: Seat, ctx: PlayContext, solver: DoubleDummySolver): Promise<{ accept: boolean; reason: string }> {
  const deals = sampleDeals(state, seat, ctx.shown, DEALS, 20_000, seedOf(state, ctx, `claim ${seat}`), [claim.seat], ctx.systemFor);
  if (deals.length === 0) return { accept: true, reason: "no deal fitted what it knows, so it takes the claim on trust" };
  const tricks = await sideTricks(state, claim.seat, deals, solver);
  const worst = Math.min(...tricks);
  return worst >= claim.tricks
    ? { accept: true, reason: `on every deal that fits, the claim makes (${claim.tricks} of ${tricksLeft(state)})` }
    : { accept: false, reason: `on some deals it fails: as few as ${worst} tricks for the claimer's side` };
}

/** A claim for the bot to move, when its side's tricks are certain; null when there's still play in the hand. */
export async function botClaim(state: PlayState, ctx: PlayContext, solver: DoubleDummySolver): Promise<number | null> {
  const left = tricksLeft(state);
  if (left < 2 || currentTrick(state).cards.length > 0) return null;
  const who = decider(state, toPlay(state));
  const deals = sampleDeals(state, who, ctx.shown, DEALS, 20_000, seedOf(state, ctx, `claim by ${who}`), [], ctx.systemFor);
  if (deals.length < 8) return null;
  const tricks = await sideTricks(state, who, deals, solver);
  const min = Math.min(...tricks);
  return min === Math.max(...tricks) && min > 0 ? min : null;
}
