// The bidder's vocabulary: what a call shows about a hand, and a rule that makes a call.

import type { Call } from "../auction";
import { type Suit, SUITS } from "../types";
import type { HandFacts } from "./evaluate";

/** A range, inclusive. 0–37 HCP and 0–13 cards are "nothing known". */
export type Range = [number, number];

/**
 * How good a suit is (as `decentSuit` and `goodSuit` in evaluate.ts): "decent", one of the top three
 * honours and two of the top five; "good", two of the top three or three of the top five.
 */
export type SuitQuality = "decent" | "good";

/** What the auction has shown about one hand. */
export interface Shown {
  hcp: Range;
  len: Record<Suit, Range>;
  balanced: boolean;
  /** Suits shown to be of at least this quality (an overcall's suit); absent says nothing. */
  quality?: Partial<Record<Suit, SuitQuality>>;
}

/** Part of what a call shows; anything left out says nothing new. */
export interface ShowsPatch {
  hcp?: Range;
  len?: Partial<Record<Suit, Range>>;
  balanced?: boolean;
  quality?: Partial<Record<Suit, SuitQuality>>;
}

/** Does a suit's holding (ranks, any order) meet a quality? */
export function meetsQuality(ranks: string, q: SuitQuality): boolean {
  const top = [...ranks].filter((r) => "AKQ".includes(r)).length;
  const honours = [...ranks].filter((r) => "AKQJT".includes(r)).length;
  return q === "good" ? top >= 2 || honours >= 3 : top >= 1 && honours >= 2;
}

/** How long partner must keep bidding: none, for one more call, or until game. */
export type Forcing = "no" | "one round" | "game";

/**
 * A call a rule can make, in a given position. The rules for a position are a list of these in
 * priority order: the bot makes the first one its hand passes (`when`), and anyone's call means
 * what the rules that make it say.
 */
export interface CallRule {
  call: Call;
  /** The convention's name, when it has one: "Stayman", "Jacoby transfer". */
  name?: string;
  /** What the call tells partner, in a learner's words: "15–17 HCP, balanced". */
  meaning: string;
  shows?: ShowsPatch;
  forcing?: Forcing;
  /** Does this hand make this call? */
  when: (h: HandFacts) => boolean;
  /** Why this hand makes it ("16 HCP and 4-3-3-2: balanced, in range"). Defaults to the meaning. */
  why?: (h: HandFacts) => string;
  /**
   * The rules don't settle it: the bot chose by a rule of thumb between these calls. Double-dummy
   * simulation will decide these later (stage 3).
   */
  hard?: { candidates: Call[]; rule: string };
}

/** A call in an auction with what the bidder understands it to mean. */
export interface ReadCall {
  call: Call;
  seat: import("../types").Seat;
  /** The rule that matched, for a bot's own call; null when no rule describes it. */
  rule: CallRule | null;
  meaning: string;
  forcing: Forcing;
  /** True when no rule describes the call, so it was read as natural. */
  guessed: boolean;
}

export const ANY_HCP: Range = [0, 37];
export const ANY_LEN: Range = [0, 13];

export function unknownHand(): Shown {
  return { hcp: [...ANY_HCP], len: { S: [...ANY_LEN], H: [...ANY_LEN], D: [...ANY_LEN], C: [...ANY_LEN] }, balanced: false };
}

/** Narrow a range by another; if they don't overlap (a call that contradicts an earlier one), the new one wins. */
function narrow(a: Range, b: Range): Range {
  const lo = Math.max(a[0], b[0]);
  const hi = Math.min(a[1], b[1]);
  return lo <= hi ? [lo, hi] : [b[0], b[1]];
}

/** What's known after a call that shows `patch`. */
export function applyShows(known: Shown, patch: ShowsPatch | undefined): Shown {
  if (!patch) return known;
  const len = { ...known.len };
  for (const s of SUITS) if (patch.len?.[s]) len[s] = narrow(known.len[s], patch.len[s]!);
  const out: Shown = {
    hcp: patch.hcp ? narrow(known.hcp, patch.hcp) : known.hcp,
    len,
    balanced: known.balanced || !!patch.balanced,
  };
  // Quality only ever goes up: "good" stays good when a later call shows the suit is decent.
  const quality = { ...known.quality };
  for (const s of SUITS) if (patch.quality?.[s] && quality[s] !== "good") quality[s] = patch.quality[s];
  if (Object.keys(quality).length > 0) out.quality = quality;
  return out;
}

/** The widest of several patches (a call that more than one rule can make means any of them). */
export function unionShows(patches: (ShowsPatch | undefined)[]): ShowsPatch | undefined {
  // A rule that shows nothing in particular widens the union to nothing.
  if (patches.length === 0 || patches.some((p) => !p)) return undefined;
  const real = patches as ShowsPatch[];
  const out: ShowsPatch = {};
  if (real.every((p) => p.hcp)) out.hcp = [Math.min(...real.map((p) => p.hcp![0])), Math.max(...real.map((p) => p.hcp![1]))];
  for (const s of SUITS) {
    if (real.every((p) => p.len?.[s])) {
      out.len = { ...out.len, [s]: [Math.min(...real.map((p) => p.len![s]![0])), Math.max(...real.map((p) => p.len![s]![1]))] };
    }
  }
  if (real.every((p) => p.balanced)) out.balanced = true;
  return out;
}

/** "12–21", "15+", "at most 9". */
export function rangeWords(r: Range, unit: string, max = 37): string {
  if (r[0] === r[1]) return `${r[0]} ${unit}`;
  if (r[1] >= max) return `${r[0]}+ ${unit}`;
  if (r[0] <= 0) return `at most ${r[1]} ${unit}`;
  return `${r[0]}–${r[1]} ${unit}`;
}
