// The ideal contract for a partnership's two hands (docs/HARNESS.md, stage 1), and how much a
// contract loses against it.
//
// Each layout of East–West's cards is solved once: the tricks North and South take as declarer in
// each strain (10 numbers). The level doesn't change the trick count, only the score, so those 10
// numbers price every North–South contract at every level. The ideal is the contract and declarer
// with the best average score; a contract's loss is the average, over the layouts, of the IMPs
// between the ideal and it on the same layout (per layout, because IMPs aren't linear).

import type { DoubleDummyTable } from "../core/doubleDummy";
import { imps } from "../core/imps";
import { scoreResult } from "../core/scoring";
import { type Contract, type Seat, type Strain, type Vulnerability, SUIT_SYMBOLS } from "../core/types";

export const NS_DECLARERS = ["N", "S"] as const;
export type NsDeclarer = (typeof NS_DECLARERS)[number];
export const BENCH_STRAINS: readonly Strain[] = ["C", "D", "H", "S", "NT"];

/** One layout's tricks as 10 hex digits: North declaring in ♣ ♦ ♥ ♠ NT, then South. */
export function encodeTricks(table: DoubleDummyTable): string {
  return NS_DECLARERS.map((d) => BENCH_STRAINS.map((s) => table[d][s].toString(16)).join("")).join("");
}

export function tricksOf(layout: string, declarer: NsDeclarer, strain: Strain): number {
  return parseInt(layout[NS_DECLARERS.indexOf(declarer) * 5 + BENCH_STRAINS.indexOf(strain)]!, 16);
}

/** One North–South contract (or passing it out) and its score on each layout. */
export interface ContractOption {
  /** Null when the board is passed out. */
  contract: Contract | null;
  declarer: NsDeclarer | null;
  scores: number[];
  mean: number;
}

const scoreMemo = new Map<string, number>();
function score(level: number, strain: Strain, declarer: NsDeclarer, vul: Vulnerability, tricks: number): number {
  const key = `${level}${strain}${declarer}${vul}${tricks}`;
  let s = scoreMemo.get(key);
  if (s === undefined) {
    s = scoreResult({ contract: { level, strain, doubling: "" }, declarer, tricks }, vul).nsScore;
    scoreMemo.set(key, s);
  }
  return s;
}

/**
 * Every North–South contract on these layouts, best average score first. On a tie the earlier one
 * stays first: passing out, then lower levels, then ♣ ♦ ♥ ♠ NT, then North before South.
 */
export function contractOptions(layouts: string[], vul: Vulnerability): ContractOption[] {
  const out: ContractOption[] = [{ contract: null, declarer: null, scores: layouts.map(() => 0), mean: 0 }];
  for (let level = 1; level <= 7; level++) {
    for (const strain of BENCH_STRAINS) {
      for (const declarer of NS_DECLARERS) {
        const scores = layouts.map((l) => score(level, strain, declarer, vul, tricksOf(l, declarer, strain)));
        out.push({ contract: { level, strain, doubling: "" }, declarer, scores, mean: average(scores) });
      }
    }
  }
  // Stable sort: ties keep the order above.
  return out.sort((a, b) => b.mean - a.mean);
}

/** The option for a contract and declarer (undoubled; a pass-out when contract is null). */
export function optionFor(options: ContractOption[], contract: Contract | null, declarer: Seat | null): ContractOption {
  const found = options.find((o) =>
    contract === null ? o.contract === null : o.contract?.level === contract.level && o.contract.strain === contract.strain && o.declarer === declarer,
  );
  if (!found) throw new Error(`No option for ${contract ? `${contract.level}${contract.strain}` : "a pass-out"} by ${declarer}`);
  return found;
}

/** Average IMPs a contract loses against the ideal, layout by layout. Can be a little negative. */
export function expectedLoss(ideal: ContractOption, option: ContractOption): number {
  return average(ideal.scores.map((s, i) => imps(s - option.scores[i]!)));
}

/** 0 passed out, 1 part-score, 2 game, 3 small slam, 4 grand slam. */
export function contractClass(c: Contract | null): number {
  if (!c) return 0;
  if (c.level === 7) return 4;
  if (c.level === 6) return 3;
  const game = c.strain === "NT" ? 3 : c.strain === "H" || c.strain === "S" ? 4 : 5;
  return c.level >= game ? 2 : 1;
}

export const CLASS_NAMES = ["Passed out", "Part-score", "Game", "Small slam", "Grand slam"] as const;

/** Losses no bigger than this count as reaching the ideal (a near-tie). */
export const NEAR_IDEAL = 0.5;

export type Miss = "At or near the ideal" | "Too low" | "Too high" | "Wrong strain" | "Wrong declarer";

/** How the bot's contract went wrong, if it did. */
export function missKind(bot: ContractOption, ideal: ContractOption, loss: number): Miss {
  if (loss <= NEAR_IDEAL) return "At or near the ideal";
  const b = bot.contract;
  const i = ideal.contract;
  const bc = contractClass(b);
  const ic = contractClass(i);
  if (bc !== ic) return bc < ic ? "Too low" : "Too high";
  if (!b || !i) return "Wrong strain"; // can't happen: both classes 0 means both passed out
  if (b.strain !== i.strain) return "Wrong strain";
  if (b.level !== i.level) return b.level < i.level ? "Too low" : "Too high";
  return "Wrong declarer";
}

/** "4♠ by S", "Passed out". */
export function optionText(o: { contract: Contract | null; declarer: Seat | null }): string {
  if (!o.contract) return "Passed out";
  const strain = o.contract.strain === "NT" ? "NT" : SUIT_SYMBOLS[o.contract.strain];
  return `${o.contract.level}${strain} by ${o.declarer}`;
}

export const average = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
