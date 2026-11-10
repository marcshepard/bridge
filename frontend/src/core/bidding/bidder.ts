// The bidder: reads an auction (what each call means and what it showed) and chooses a call for a
// hand, with its reason. Pure and repeatable: the same hand, auction and settings always give the
// same call, so a review can work the explanations out again whenever it's opened.

import { type Call, isAuctionOver } from "../auction";
import { nextSeat } from "../play";
import type { Hand, Seat, Suit, Vulnerability } from "../types";
import { evaluate } from "./evaluate";
import { type CallRule, type ReadCall, type Shown, type ShowsPatch, applyShows, unknownHand } from "./model";
import { type Position, PASS, gameForced, gameLevel, isBid } from "./position";
import { NO_RULE } from "./sayc/general";
import { saycRules } from "./sayc";
import { callName } from "./sayc/common";
import { SAYC_DEFAULTS, type SystemSettings, type TableSystems } from "./system";
import type { DoubleDummySolver } from "../doubleDummy";
import { type Simulation, type SimulationOptions, simulateHardCall } from "./simulate";
import { directionOf } from "../types";

/**
 * The card a call is read and chosen by: one card for the whole table, or one per side (each side's
 * calls mean what that side's card says).
 */
export type Systems = SystemSettings | TableSystems;

/** The card a seat bids by. */
export const systemFor = (systems: Systems, seat: Seat): SystemSettings => ("NS" in systems ? systems[directionOf(seat)] : systems);

export interface Deal {
  dealer: Seat;
  vul: Vulnerability;
}

export interface Decision {
  call: Call;
  /** What the call tells partner. */
  meaning: string;
  /** Why this hand makes it. */
  reason: string;
  /** The convention's name, if any. */
  name: string | null;
  /** The rules don't settle it: the candidates and the rule of thumb used. */
  hard: CallRule["hard"] | null;
  /** No rule fits this position yet; the bot passed or made the cheapest natural bid. */
  fallback: boolean;
  /** A hard call decided by simulation: the deals, and how each candidate did. */
  simulation?: Simulation;
}

/** The position before call number `calls.length`, reading every call so far. */
export function positionAt(deal: Deal, calls: Call[], settings: Systems = SAYC_DEFAULTS): Position {
  return readAuction(deal, calls, settings).at(-1)!.position;
}

/** One step of a read auction: the position a call was made in, and how it was read. */
export interface ReadStep {
  position: Position;
  /** Absent for the final step (the position after the last call). */
  read?: ReadCall;
}

/**
 * Reads the auction call by call: the position each call was made in, what the rules say it means,
 * and what each hand has shown. The last step is the position after the last call.
 */
export function readAuction(deal: Deal, calls: Call[], settings: Systems = SAYC_DEFAULTS): ReadStep[] {
  let position: Position = {
    s: systemFor(settings, deal.dealer),
    dealer: deal.dealer,
    vul: deal.vul,
    seat: deal.dealer,
    calls: [],
    read: [],
    shown: { N: unknownHand(), E: unknownHand(), S: unknownHand(), W: unknownHand() },
  };
  const steps: ReadStep[] = [];
  for (const call of calls) {
    const read = readCall(position, call);
    steps.push({ position, read });
    const patch = read.rule?.shows ?? (read.guessed ? naturalShows(call) : undefined);
    let shown = applyShows(position.shown[position.seat], patch);
    if (fastArrival(position, call, read)) {
      // Bidding game when it's already forced: no extras, so the bottom of what's been shown.
      shown = { ...shown, hcp: [shown.hcp[0], Math.min(shown.hcp[1], shown.hcp[0] + 1)] };
      read.meaning = `${read.meaning} Game was already forced, so bidding it directly shows no extra strength.`;
    }
    position = {
      ...position,
      seat: nextSeat(position.seat),
      s: systemFor(settings, nextSeat(position.seat)),
      calls: [...position.calls, call],
      read: [...position.read, read],
      shown: { ...position.shown, [position.seat]: shown },
    };
  }
  steps.push({ position });
  return steps;
}

/**
 * "Fast arrival": in an auction already forced to game, bidding game (exactly game, not past it)
 * says there's nothing more to show: the bottom of the range. Not for conventional calls.
 */
function fastArrival(p: Position, call: Call, read: ReadCall): boolean {
  if (!isBid(call) || !gameForced(p) || call.level !== gameLevel(call.strain)) return false;
  return !read.rule?.name;
}

/** What a call means in its position: the first rule that makes it, or natural if none does. */
function readCall(p: Position, call: Call): ReadCall {
  const rule = saycRules(p).find((r) => sameCall(r.call, call)) ?? null;
  if (rule && rule.name !== NO_RULE) {
    return { call, seat: p.seat, rule, meaning: rule.meaning, forcing: rule.forcing ?? "no", guessed: false };
  }
  return { call, seat: p.seat, rule: null, meaning: naturalMeaning(call), forcing: "no", guessed: true };
}

function sameCall(a: Call, b: Call) {
  return a.kind === b.kind && (a.kind !== "bid" || (b.kind === "bid" && a.level === b.level && a.strain === b.strain));
}

function naturalMeaning(call: Call): string {
  if (call.kind === "pass") return "Pass.";
  if (call.kind === "double") return "Double: no rule describes it here; read as for penalties.";
  if (call.kind === "redouble") return "Redouble.";
  return `${callName(call)}: no rule describes it here; read as natural${call.strain === "NT" ? "" : ", 4+ cards"}.`;
}

function naturalShows(call: Call): ShowsPatch | undefined {
  if (!isBid(call) || call.strain === "NT") return undefined;
  return { len: { [call.strain as Suit]: [4, 13] } };
}

/** The bot's call for this hand at this point in the auction, with its meaning and reason. */
export function chooseCall(hand: Hand, deal: Deal, calls: Call[], settings: Systems = SAYC_DEFAULTS): Decision {
  return decide(positionAt(deal, calls, settings), hand);
}

/** The bot's call for this hand in a position already read. */
export function decide(p: Position, hand: Hand): Decision {
  const h = evaluate(hand);
  const rule = saycRules(p).find((r) => r.when(h));
  if (!rule) {
    return { call: PASS, meaning: "Pass.", reason: "No rule for this position yet, so the bot passed.", name: null, hard: null, fallback: true };
  }
  return {
    call: rule.call,
    meaning: rule.meaning,
    reason: rule.why ? rule.why(h) : rule.meaning,
    name: rule.name && rule.name !== NO_RULE ? rule.name : null,
    hard: rule.hard ?? null,
    fallback: rule.name === NO_RULE,
  };
}

/** One call of an auction, explained for the review. */
export interface ReviewedCall {
  seat: Seat;
  call: Call;
  /** What the call means, as the rules read it (null-ruled calls read as natural). */
  read: ReadCall;
  /** What the auction had shown about each hand before this call. */
  shownBefore: Record<Seat, Shown>;
  /** The position the call was made in (to simulate a hard call for the review). */
  position: Position;
  /** What the bot would have bid with this seat's hand here (the actual call, for a bot). */
  bot: Decision;
  /** The call matches what the bot would have bid. */
  agrees: boolean;
}

/** Every call of an auction, explained: its meaning, and what the bot would have bid in that seat. */
export function reviewAuction(hands: Record<Seat, Hand>, deal: Deal, calls: Call[], settings: Systems = SAYC_DEFAULTS): ReviewedCall[] {
  return readAuction(deal, calls, settings)
    .filter((step): step is Required<ReadStep> => !!step.read)
    .map(({ position, read }) => {
      const bot = decide(position, hands[position.seat]);
      return { seat: position.seat, call: read.call, read, shownBefore: position.shown, position, bot, agrees: sameCall(bot.call, read.call) };
    });
}

/**
 * The whole auction as the bots would bid it, all four seats (for "watch the bots" and the
 * report). Stops at the end of the auction, or after 60 calls as a safety net.
 */
export function botAuction(hands: Record<Seat, Hand>, deal: Deal, settings: Systems = SAYC_DEFAULTS): Decision[] {
  const out: Decision[] = [];
  const calls: Call[] = [];
  let p = positionAt(deal, calls, settings);
  for (let i = 0; i < 60; i++) {
    const d = decide(p, hands[p.seat]);
    out.push(d);
    calls.push(d.call);
    if (isAuctionOver(calls)) break;
    p = positionAt(deal, calls, settings);
  }
  return out;
}

// ---- With simulation ------------------------------------------------------------------------------

/**
 * The bot's call, with any hard call decided by simulation (double dummy over deals that fit the
 * auction). Without a solver, or when too few deals fit, the rule of thumb stands. On a tie the rule
 * of thumb's choice stands too.
 */
export async function decideWithSimulation(p: Position, hand: Hand, solver: DoubleDummySolver | null, options?: SimulationOptions): Promise<Decision> {
  const d = decide(p, hand);
  if (!d.hard || !solver) return d;
  const sim = await simulateHardCall(p, hand, d.hard.candidates, solver, options);
  if (!sim) return d;
  const rule = sim.results.find((r) => sameCall(r.call, d.call));
  const best = rule && rule.share >= sim.results[0]!.share ? rule.call : sim.best;
  const chosen = sim.results.find((r) => sameCall(r.call, best))!;
  const meaning = sameCall(best, d.call) ? d.meaning : (saycRules(p).find((r) => sameCall(r.call, best))?.meaning ?? d.meaning);
  const others = sim.results
    .filter((r) => !sameCall(r.call, best))
    .map((r) => `${callName(r.call)} ${Math.round(r.share * 100)}%`)
    .join(", ");
  return {
    ...d,
    call: best,
    meaning,
    reason: `In ${sim.deals} deals that fit the bidding, ${callName(best)} scored best: ${Math.round(chosen.share * 100)}% of the matchpoints against the other choices (${others})`,
    simulation: sim,
  };
}

/** chooseCall, with any hard call decided by simulation. */
export async function chooseCallWithSimulation(
  hand: Hand,
  deal: Deal,
  calls: Call[],
  settings: Systems,
  solver: DoubleDummySolver | null,
  options?: SimulationOptions,
): Promise<Decision> {
  return decideWithSimulation(positionAt(deal, calls, settings), hand, solver, options);
}

/** botAuction, with hard calls decided by simulation (for the report). */
export async function botAuctionWithSimulation(
  hands: Record<Seat, Hand>,
  deal: Deal,
  settings: Systems,
  solver: DoubleDummySolver,
  options?: SimulationOptions,
): Promise<Decision[]> {
  const out: Decision[] = [];
  const calls: Call[] = [];
  for (let i = 0; i < 60 && !isAuctionOver(calls); i++) {
    const p = positionAt(deal, calls, settings);
    const d = await decideWithSimulation(p, hands[p.seat], solver, options);
    out.push(d);
    calls.push(d.call);
  }
  return out;
}
