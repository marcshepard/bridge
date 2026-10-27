// Comparing our result on a board against the original field.
//
// Matchpoints compare *scores*, not contracts, so any result fits somewhere in the field even if
// no other table bid the same contract — no extrapolation needed:
//
//     MP% = (field tables we beat + ½ × field tables we tied) / field size
//
// That is the same as adding our table to the field and scoring it the usual way.

import { describeResult, resultKind, type ResultKind } from "./describe";
import { datum, imps } from "./imps";
import { scoreFor, scoreResult, type ScoreBreakdown } from "./scoring";
import type { Direction, TableResult, Vulnerability } from "./types";

/** A field result, already scored. `count` is the number of tables that got exactly this. */
export interface ScoredFieldResult {
  breakdown: ScoreBreakdown;
  count: number;
}

/** All field tables that got the same score (for our direction), possibly via different contracts. */
export interface ScoreGroup {
  /** Score from our direction's point of view. */
  score: number;
  count: number;
  /** The matchpoint % we would have earned with this score. */
  mpPct: number;
  /** Distinct results that produced this score, most common first. */
  results: Array<{ result: TableResult; description: string; kind: ResultKind; count: number }>;
  /** True if this is the score we got. */
  isOurs: boolean;
}

export interface BoardComparison {
  direction: Direction;
  ours: ScoreBreakdown;
  /** Our score from our direction's point of view. */
  ourScore: number;
  fieldSize: number;
  beat: number;
  tied: number;
  lost: number;
  /** null when the field is empty. */
  mpPct: number | null;
  /** Field average for our direction, rounded to 10. */
  fieldDatum: number;
  /** IMPs for our score against the field average. */
  impsVsDatum: number;
  /** Best score for us first. */
  groups: ScoreGroup[];
  /** The most frequent score group (ties broken by better score). */
  mostCommon: ScoreGroup | null;
}

/** Score raw field results and merge identical ones. */
export function scoreField(
  field: Array<{ result: TableResult; count?: number }>,
  vul: Vulnerability,
): ScoredFieldResult[] {
  return field.map((f) => ({ breakdown: scoreResult(f.result, vul), count: f.count ?? 1 }));
}

function sameResult(a: TableResult, b: TableResult): boolean {
  if (!a.contract || !b.contract) return !a.contract && !b.contract;
  return (
    a.declarer === b.declarer &&
    a.tricks === b.tricks &&
    a.contract.level === b.contract.level &&
    a.contract.strain === b.contract.strain &&
    a.contract.doubling === b.contract.doubling
  );
}

/** Matchpoint % for `score` against a list of field scores (all from the same direction). */
export function matchpointPct(score: number, field: Array<{ score: number; count: number }>) {
  let beat = 0;
  let tied = 0;
  let lost = 0;
  for (const f of field) {
    if (score > f.score) beat += f.count;
    else if (score === f.score) tied += f.count;
    else lost += f.count;
  }
  const n = beat + tied + lost;
  return { beat, tied, lost, n, pct: n === 0 ? null : ((beat + tied / 2) / n) * 100 };
}

export function compareBoard(
  ours: TableResult,
  direction: Direction,
  vul: Vulnerability,
  field: ScoredFieldResult[],
): BoardComparison {
  const ourBreakdown = scoreResult(ours, vul);
  const ourScore = scoreFor(direction, ourBreakdown.nsScore);

  const fieldScores = field.map((f) => ({
    score: scoreFor(direction, f.breakdown.nsScore),
    count: f.count,
    breakdown: f.breakdown,
  }));

  const { beat, tied, lost, n, pct } = matchpointPct(ourScore, fieldScores);

  // Group by score.
  const byScore = new Map<number, ScoreGroup>();
  for (const f of fieldScores) {
    let g = byScore.get(f.score);
    if (!g) {
      g = { score: f.score, count: 0, mpPct: 0, results: [], isOurs: f.score === ourScore };
      byScore.set(f.score, g);
    }
    g.count += f.count;
    const existing = g.results.find((r) => sameResult(r.result, f.breakdown.result));
    if (existing) existing.count += f.count;
    else
      g.results.push({
        result: f.breakdown.result,
        description: describeResult(f.breakdown),
        kind: resultKind(f.breakdown),
        count: f.count,
      });
  }
  const groups = [...byScore.values()].sort((a, b) => b.score - a.score);
  for (const g of groups) {
    g.mpPct = matchpointPct(g.score, fieldScores).pct ?? 0;
    g.results.sort((a, b) => b.count - a.count);
  }

  const mostCommon =
    groups.length === 0
      ? null
      : groups.reduce((best, g) => (g.count > best.count ? g : best), groups[0]!);

  const expanded = fieldScores.flatMap((f) => Array<number>(f.count).fill(f.score));
  const fieldDatum = datum(expanded);

  return {
    direction,
    ours: ourBreakdown,
    ourScore,
    fieldSize: n,
    beat,
    tied,
    lost,
    mpPct: pct,
    fieldDatum,
    impsVsDatum: n === 0 ? 0 : imps(ourScore - fieldDatum),
    groups,
    mostCommon,
  };
}
