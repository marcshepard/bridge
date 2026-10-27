// International Match Points: converts a score difference into a 0–24 scale.

/** Lower bound of each IMP band; index = IMPs. */
const IMP_THRESHOLDS = [
  0, 20, 50, 90, 130, 170, 220, 270, 320, 370, 430, 500, 600, 750, 900, 1100, 1300, 1500, 1750,
  2000, 2250, 2500, 3000, 3500, 4000,
];

/** IMPs for a score difference (signed: positive = we gained). */
export function imps(diff: number): number {
  const abs = Math.abs(diff);
  let n = 0;
  for (let i = IMP_THRESHOLDS.length - 1; i >= 0; i--) {
    if (abs >= IMP_THRESHOLDS[i]!) {
      n = i;
      break;
    }
  }
  return diff < 0 ? -n : n;
}

/**
 * The "datum" used when IMPing against a field: the average score, rounded to the nearest 10.
 * (Some events drop the top and bottom scores first; for home play the plain average is fine.)
 */
export function datum(scores: number[]): number {
  if (scores.length === 0) return 0;
  const avg = scores.reduce((s, x) => s + x, 0) / scores.length;
  return Math.round(avg / 10) * 10;
}
