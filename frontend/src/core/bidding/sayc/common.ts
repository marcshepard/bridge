// Small helpers the SAYC rule files share: building a rule, and writing calls and hands in words.

import type { Call } from "../../auction";
import { type Strain, type Suit, SUITS } from "../../types";
import { type HandFacts, SUIT_WORDS, SYMBOL } from "../evaluate";
import type { CallRule, Forcing, ShowsPatch } from "../model";
import type { Bid } from "../position";

export { SUIT_WORDS, SYMBOL };

/** "1♠", "3NT", "Pass", "Double", "Redouble". */
export function callName(c: Call): string {
  if (c.kind === "pass") return "Pass";
  if (c.kind === "double") return "Double";
  if (c.kind === "redouble") return "Redouble";
  return `${c.level}${strainSymbol(c.strain)}`;
}

export const strainSymbol = (s: Strain) => (s === "NT" ? "NT" : SYMBOL[s]);
export const strainWords = (s: Strain) => (s === "NT" ? "notrump" : SUIT_WORDS[s]);

/** "5+ ♠", "exactly 4 ♥". */
export const cards = (n: number, s: Suit, exact = false) => `${exact ? "exactly " : ""}${n}${exact ? "" : "+"} ${SYMBOL[s]}`;

/** "4-3-3-3". */
export const shapeText = (h: HandFacts) => h.shape.join("-");

/** "14 HCP" */
export const hcpText = (h: HandFacts) => `${h.hcp} HCP`;

/** A one-suit length patch: at least `min` cards. */
export const len = (s: Suit, min: number, max = 13): ShowsPatch["len"] => ({ [s]: [min, max] }) as ShowsPatch["len"];

export interface RuleOptions {
  name?: string;
  shows?: ShowsPatch;
  forcing?: Forcing;
  why?: (h: HandFacts) => string;
  hard?: CallRule["hard"];
}

/** Build a rule. */
export function rule(call: Call, meaning: string, when: (h: HandFacts) => boolean, o: RuleOptions = {}): CallRule {
  return { call, meaning, when, ...o };
}

/** Suits other than these. */
export const otherSuits = (...not: Suit[]) => SUITS.filter((s) => !not.includes(s));

/** The bid's strain as a suit (callers only use this for suit bids). */
export const suitOf = (b: Bid) => b.strain as Suit;
