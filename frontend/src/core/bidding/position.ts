// A position in the auction, as the rules see it: whose call it is, the calls so far (each with
// what it was read to mean), and what each hand has shown. Plus the small questions every rule
// asks: who opened, is partner forcing me, how cheaply can I bid a strain, do we have a fit.

import { type Call, canCall } from "../auction";
import { nextSeat } from "../play";
import { type Seat, type Strain, type Suit, type Vulnerability, STRAINS, SUITS, directionOf, isVulnerable, partnerOf } from "../types";
import type { HandFacts } from "./evaluate";
import type { ReadCall, Shown } from "./model";
import type { SystemSettings } from "./system";

export interface Position {
  s: SystemSettings;
  dealer: Seat;
  vul: Vulnerability;
  /** Whose call it is. */
  seat: Seat;
  calls: Call[];
  /** The calls so far, read. */
  read: ReadCall[];
  /** What each hand has shown so far. */
  shown: Record<Seat, Shown>;
}

export type Bid = Extract<Call, { kind: "bid" }>;
export const bid = (level: number, strain: Strain): Bid => ({ kind: "bid", level, strain });
export const PASS: Call = { kind: "pass" };
export const DOUBLE: Call = { kind: "double" };
export const REDOUBLE: Call = { kind: "redouble" };

export const isBid = (c: Call): c is Bid => c.kind === "bid";
export const sameCall = (a: Call, b: Call) =>
  a.kind === b.kind && (a.kind !== "bid" || (b.kind === "bid" && a.level === b.level && a.strain === b.strain));

export const rhoOf = (seat: Seat): Seat => nextSeat(nextSeat(nextSeat(seat)));
export const lhoOf = (seat: Seat): Seat => nextSeat(seat);
export const partner = (p: Position) => partnerOf(p.seat);
export const isOurs = (p: Position, seat: Seat) => directionOf(seat) === directionOf(p.seat);

export const weVul = (p: Position) => isVulnerable(p.vul, directionOf(p.seat));
export const theyVul = (p: Position) => isVulnerable(p.vul, directionOf(lhoOf(p.seat)));

/** Calls other than passes, in order. */
export const actions = (p: Position) => p.read.filter((r) => r.call.kind !== "pass");
export const bids = (p: Position) => p.read.filter((r) => isBid(r.call)) as (ReadCall & { call: Bid })[];
export const lastBid = (p: Position) => bids(p).at(-1) ?? null;
/** The first bid of the auction. */
export const opening = (p: Position) => bids(p)[0] ?? null;
export const callsBy = (p: Position, seat: Seat) => p.read.filter((r) => r.seat === seat);
export const actionsBy = (p: Position, seat: Seat) => callsBy(p, seat).filter((r) => r.call.kind !== "pass");
export const bidsBy = (p: Position, seat: Seat) => callsBy(p, seat).filter((r) => isBid(r.call)) as (ReadCall & { call: Bid })[];
export const ourActions = (p: Position) => actions(p).filter((r) => isOurs(p, r.seat));
export const theirActions = (p: Position) => actions(p).filter((r) => !isOurs(p, r.seat));
/** The call just before this one (right-hand opponent's), if any. */
export const rhoCall = (p: Position) => p.read.at(-1) ?? null;
/** Partner's latest call, if any. */
export const partnerLast = (p: Position) => callsBy(p, partner(p)).at(-1) ?? null;
/** My own latest call, if any. */
export const myLast = (p: Position) => callsBy(p, p.seat).at(-1) ?? null;

/** No bids yet: an opening position. Which seat: 1 for the dealer, 4 after three passes. */
export const openingSeat = (p: Position) => p.calls.length + 1;

/** May the next player make this call? */
export const canMake = (p: Position, call: Call) => canCall(p.dealer, p.calls, call);

/** The lowest level at which `strain` can be bid now (8 if it can't). */
export function cheapest(p: Position, strain: Strain): number {
  const last = lastBid(p)?.call;
  if (!last) return 1;
  return STRAINS.indexOf(strain) > STRAINS.indexOf(last.strain) ? last.level : last.level + 1;
}

/** The cheapest bid in a strain, or null if it'd be above seven. */
export function cheapBid(p: Position, strain: Strain, jump = 0): Bid | null {
  const level = cheapest(p, strain) + jump;
  return level <= 7 ? bid(level, strain) : null;
}

/** Is `call` a jump: a bid one or more levels higher than it needed to be? */
export const isJump = (p: Position, b: Bid) => b.level > cheapest(p, b.strain);

/**
 * Must I bid? Partner's last call was forcing and the right-hand opponent passed (a bid or double
 * by them takes the pressure off), or our side is forced to game and we're not there yet.
 */
export function forced(p: Position): boolean {
  const pl = partnerLast(p);
  if (!pl) return false;
  const rho = rhoCall(p);
  if (pl.forcing === "one round" && rho?.call.kind === "pass") return true;
  return gameForced(p) && !atGame(p);
}

/** Has our side made a game-forcing call? */
export const gameForced = (p: Position) => ourActions(p).some((r) => r.forcing === "game");

/** Is the last bid ours, at game level or higher? */
export function atGame(p: Position): boolean {
  const lb = lastBid(p);
  if (!lb || !isOurs(p, lb.seat)) return false;
  return lb.call.level >= gameLevel(lb.call.strain);
}

export const gameLevel = (strain: Strain) => (strain === "NT" ? 3 : strain === "H" || strain === "S" ? 4 : 5);

/** The last bid, if it's our side's. */
export function ourContract(p: Position): Bid | null {
  const lb = lastBid(p);
  return lb && isOurs(p, lb.seat) ? lb.call : null;
}

/** What partner has shown: HCP range and suit lengths. */
export const partnerShown = (p: Position) => p.shown[partner(p)];

/**
 * Partner's HCP, for planning: the bottom of their range, and the figure to plan on. That's near
 * the bottom, not the middle: "19+" means 19 or a little more, and anything extra is partner's to
 * show. So the bottom plus at most 2 (the middle of a narrow range like 15–17).
 */
export function partnerPoints(p: Position): { min: number; likely: number; max: number } {
  const [min, max] = partnerShown(p).hcp;
  return { min, likely: min + Math.min(2, Math.floor((max - min) / 2)), max };
}

/** Our best fit (8+ cards between us, counting what partner has shown), majors first, then longest. */
export function fitWith(p: Position, h: HandFacts): Suit | null {
  const ps = partnerShown(p);
  const fits = SUITS.filter((s) => h.len[s] + ps.len[s][0] >= 8);
  if (fits.length === 0) return null;
  return fits.sort((a, b) => Number(isMajorSuit(b)) - Number(isMajorSuit(a)) || h.len[b] + ps.len[b][0] - (h.len[a] + ps.len[a][0]))[0]!;
}

const isMajorSuit = (s: Suit) => s === "S" || s === "H";

/**
 * Conventional calls whose strain says nothing about holding that suit (Stayman's 2♣, a Blackwood
 * answer's 5♥), so they don't count as bidding the suit.
 */
const ARTIFICIAL = new Set([
  "Strong 2♣",
  "Stayman",
  "Jacoby transfer",
  "Jacoby 2NT",
  "Jacoby 2NT answer",
  "Waiting 2♦",
  "Blackwood",
  "Blackwood answer",
  "Roman Key Card answer",
  "Queen ask",
  "Gerber answer",
  "Quantitative 4NT",
  "Michaels",
  "Michaels ask",
  "Unusual 2NT",
  "Cuebid",
  "Cuebid raise",
  "Jordan 2NT",
  "2NT feature ask",
  "Feature",
  "Gambling 3NT",
  "Pass or correct",
]);

/** Does this call name a suit its bidder holds (or, for notrump, a natural notrump bid)? */
export const isNatural = (r: ReadCall) => isBid(r.call) && !r.guessed && !ARTIFICIAL.has(r.rule?.name ?? "");

function naturalSuits(list: ReadCall[]): Suit[] {
  const out: Suit[] = [];
  for (const r of list) if (isNatural(r) && isBid(r.call) && r.call.strain !== "NT" && !out.includes(r.call.strain)) out.push(r.call.strain);
  return out;
}

/** The suits our side has bid naturally, in order, without repeats. */
export const ourSuits = (p: Position): Suit[] => naturalSuits(ourActions(p));

/** The suits the opponents have bid naturally. */
export const theirSuits = (p: Position): Suit[] => naturalSuits(theirActions(p));

/** Suits nobody at the table has bid. */
export function unbidSuits(p: Position): Suit[] {
  const named = bids(p).map((b) => b.call.strain);
  return SUITS.filter((s) => !named.includes(s));
}
