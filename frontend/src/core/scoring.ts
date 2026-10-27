// Duplicate bridge scoring, with an itemised breakdown of every point.
//
// The rules (Laws of Duplicate Bridge, Law 77):
//
//   Contract tricks (only tricks bid, beyond the first six):
//     ♣/♦ 20 each · ♥/♠ 30 each · NT 40 for the first, 30 for each after
//     ×2 if doubled, ×4 if redoubled
//   Bonuses when the contract makes:
//     Game (contract tricks ≥ 100)   300 not vulnerable / 500 vulnerable
//     Part score (contract tricks < 100)            50
//     Small slam (6-level)           500 NV / 750 V
//     Grand slam (7-level)           1000 NV / 1500 V
//     Making a doubled contract       50 ("the insult"); redoubled 100
//   Overtricks:
//     Undoubled: the trick value (20 for minors, 30 for majors and NT)
//     Doubled: 100 NV / 200 V each · Redoubled: 200 NV / 400 V each
//   Undertricks (the defenders score these):
//     Undoubled: 50 NV / 100 V each
//     Doubled NV: 100 for the 1st, 200 for the 2nd and 3rd, 300 for each after
//     Doubled V:  200 for the 1st, 300 for each after
//     Redoubled: twice the doubled amounts
//
// `scoreResult` returns the total plus one `ScoreLine` per component, so the UI
// can show "70 for 1NT+1, 50 part-score bonus = 120" rather than just "120".

import { formatContract } from "./contract";
import {
  type Contract,
  type Direction,
  type Strain,
  type TableResult,
  type Vulnerability,
  directionOf,
  isVulnerable,
  SUIT_SYMBOLS,
} from "./types";

export interface ScoreLine {
  /** What the points are for, e.g. "Game bonus". */
  label: string;
  /** How they were worked out, e.g. "4 × 30". Empty when the label says it all. */
  detail: string;
  /** Points. Positive = to declarer's side; negative = to the defenders. */
  points: number;
}

export interface ScoreBreakdown {
  result: TableResult;
  /** Whether declarer's side was vulnerable. */
  vulnerable: boolean;
  made: boolean;
  /** Tricks over (positive) or under (negative) the contract. */
  overUnder: number;
  /** Score from declarer's side's point of view (negative when the contract fails). */
  declarerScore: number;
  /** Score from North–South's point of view — the usual way scores are listed. */
  nsScore: number;
  lines: ScoreLine[];
}

const DOUBLING_FACTOR = { "": 1, X: 2, XX: 4 } as const;
const DOUBLING_WORD = { "": "", X: "doubled", XX: "redoubled" } as const;

/** Points for one trick in this strain, undoubled. NT's first trick is handled separately. */
function trickValue(strain: Strain): number {
  return strain === "C" || strain === "D" ? 20 : 30;
}

function strainLabel(strain: Strain): string {
  return strain === "NT" ? "NT" : SUIT_SYMBOLS[strain];
}

function vulWord(vul: boolean): string {
  return vul ? "vulnerable" : "not vulnerable";
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

/** Contract-trick points (before any bonus), plus a human explanation. */
export function contractTrickPoints(c: Contract): { points: number; detail: string } {
  const factor = DOUBLING_FACTOR[c.doubling];
  let base: number;
  let detail: string;
  if (c.strain === "NT") {
    base = 40 + 30 * (c.level - 1);
    detail = c.level === 1 ? "40 for the first trick" : `40 + ${c.level - 1} × 30`;
  } else {
    const v = trickValue(c.strain);
    base = v * c.level;
    detail = `${c.level} × ${v}`;
  }
  if (factor > 1) detail = `(${detail}) × ${factor} ${DOUBLING_WORD[c.doubling]}`;
  return { points: base * factor, detail };
}

function madeLines(c: Contract, overtricks: number, vul: boolean): ScoreLine[] {
  const lines: ScoreLine[] = [];
  const trick = contractTrickPoints(c);
  lines.push({
    label: `Contract tricks (${formatContract(c)})`,
    detail: trick.detail,
    points: trick.points,
  });

  if (trick.points >= 100) {
    lines.push({ label: "Game bonus", detail: vulWord(vul), points: vul ? 500 : 300 });
  } else {
    lines.push({ label: "Part-score bonus", detail: "contract tricks under 100", points: 50 });
  }

  if (c.level === 6) {
    lines.push({ label: "Small slam bonus", detail: vulWord(vul), points: vul ? 750 : 500 });
  } else if (c.level === 7) {
    lines.push({ label: "Grand slam bonus", detail: vulWord(vul), points: vul ? 1500 : 1000 });
  }

  if (c.doubling === "X") {
    lines.push({ label: "Bonus for making a doubled contract", detail: "", points: 50 });
  } else if (c.doubling === "XX") {
    lines.push({ label: "Bonus for making a redoubled contract", detail: "", points: 100 });
  }

  if (overtricks > 0) {
    let each: number;
    let why: string;
    if (c.doubling === "") {
      each = trickValue(c.strain);
      why = `${strainLabel(c.strain)} trick value`;
    } else {
      each = (vul ? 200 : 100) * (c.doubling === "XX" ? 2 : 1);
      why = `${DOUBLING_WORD[c.doubling]}, ${vulWord(vul)}`;
    }
    lines.push({
      label: overtricks === 1 ? "Overtrick" : "Overtricks",
      detail: `${overtricks} × ${each} (${why})`,
      points: overtricks * each,
    });
  }
  return lines;
}

/**
 * Penalty per undertrick, as bands so the breakdown can say
 * "1st: 100, 2nd–3rd: 2 × 200, 4th: 300".
 */
function undertrickLines(c: Contract, down: number, vul: boolean): ScoreLine[] {
  if (c.doubling === "") {
    const each = vul ? 100 : 50;
    return [
      {
        label: down === 1 ? "Undertrick" : "Undertricks",
        detail: `${down} × ${each} (undoubled, ${vulWord(vul)})`,
        points: -down * each,
      },
    ];
  }

  // Doubled schedule; redoubled is exactly twice.
  const mult = c.doubling === "XX" ? 2 : 1;
  const ctx = `${DOUBLING_WORD[c.doubling]}, ${vulWord(vul)}`;
  // [fromTrick, toTrick (inclusive, Infinity = open), pointsEach]
  const bands: Array<[number, number, number]> = vul
    ? [
        [1, 1, 200],
        [2, Infinity, 300],
      ]
    : [
        [1, 1, 100],
        [2, 3, 200],
        [4, Infinity, 300],
      ];

  const lines: ScoreLine[] = [];
  for (const [from, to, each] of bands) {
    if (down < from) break;
    const last = Math.min(down, to);
    const n = last - from + 1;
    const value = each * mult;
    const which = n === 1 ? `${ordinal(from)} undertrick` : `${ordinal(from)}–${ordinal(last)} undertricks`;
    lines.push({
      label: which.charAt(0).toUpperCase() + which.slice(1),
      detail: n === 1 ? `${ctx}` : `${n} × ${value} (${ctx})`,
      points: -n * value,
    });
  }
  return lines;
}

/** Score one table result. `vul` is the board's vulnerability. */
export function scoreResult(result: TableResult, vul: Vulnerability): ScoreBreakdown {
  const { contract, declarer } = result;
  if (!contract || !declarer) {
    return {
      result,
      vulnerable: false,
      made: false,
      overUnder: 0,
      declarerScore: 0,
      nsScore: 0,
      lines: [{ label: "Passed out", detail: "no score", points: 0 }],
    };
  }

  const side: Direction = directionOf(declarer);
  const vulnerable = isVulnerable(vul, side);
  const overUnder = result.tricks - (contract.level + 6);
  const made = overUnder >= 0;

  const lines = made
    ? madeLines(contract, overUnder, vulnerable)
    : undertrickLines(contract, -overUnder, vulnerable);

  const declarerScore = lines.reduce((sum, l) => sum + l.points, 0);
  return {
    result,
    vulnerable,
    made,
    overUnder,
    declarerScore,
    nsScore: side === "NS" ? declarerScore : -declarerScore,
    lines,
  };
}

/** Convert a North–South score to the given direction's point of view. */
export function scoreFor(direction: Direction, nsScore: number): number {
  return direction === "NS" ? nsScore : -nsScore;
}

/** "+420", "−50", "0". */
export function formatScore(score: number): string {
  if (score === 0) return "0";
  return score > 0 ? `+${score}` : `−${-score}`;
}
