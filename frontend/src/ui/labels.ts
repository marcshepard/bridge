// Wording that depends on where you sit: "Partner", "your left-hand opponent", "You're vulnerable".

import { type Seat, type Vulnerability, SEATS, SEAT_NAMES, directionOf, isVulnerable } from "../core/types";

export type Relation = "you" | "partner" | "lho" | "rho";

export function relationTo(me: Seat, other: Seat): Relation {
  const d = (SEATS.indexOf(other) - SEATS.indexOf(me) + 4) % 4;
  return (["you", "lho", "partner", "rho"] as const)[d]!;
}

const RELATION_SHORT: Record<Relation, string> = {
  you: "You",
  partner: "Partner",
  lho: "Left opp.",
  rho: "Right opp.",
};

const RELATION_LONG: Record<Relation, string> = {
  you: "you",
  partner: "your partner",
  lho: "your left-hand opponent",
  rho: "your right-hand opponent",
};

export function relationShort(me: Seat, other: Seat): string {
  return RELATION_SHORT[relationTo(me, other)];
}

export function seatWithRelation(me: Seat, other: Seat): string {
  return `${SEAT_NAMES[other]} (${RELATION_LONG[relationTo(me, other)]})`;
}

export function vulnerabilityPhrase(me: Seat, vul: Vulnerability): string {
  if (vul === "None") return "Nobody is vulnerable";
  if (vul === "Both") return "Everybody is vulnerable";
  return isVulnerable(vul, directionOf(me)) ? "You are vulnerable, they are not" : "They are vulnerable, you are not";
}

/** Percentages are shown as whole numbers: "83%". (Calculations stay exact.) */
export function formatPct(pct: number | null): string {
  return pct === null ? "—" : `${Math.round(pct)}%`;
}

/**
 * Matchpoints for both sides, "83 / 17": yours rounded, theirs 100 minus that, so the pair always
 * adds up to 100 (50.5 / 49.5 shows as 51 / 49, never 51 / 50).
 */
export function formatMpPair(pct: number): string {
  const ours = Math.round(pct);
  return `${ours} / ${100 - ours}`;
}

export function formatImps(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0";
}

/** "+67", "−12", "0": a ± margin as a whole number. */
export function formatMargin(n: number): string {
  const r = Math.round(n);
  if (r === 0) return "0";
  return r > 0 ? `+${r}` : `−${-r}`;
}

/** "K7PM3QXT" → "K7PM-3QXT": easier to read out and type. */
export function formatJoinCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/**
 * One board's net: your matchpoint % minus theirs ("+90"), with the percentages behind it ("95 − 5").
 * Percentages are shown whole unless rounding them would make the sum look wrong: 95.4% nets +91,
 * which "95 − 5" doesn't explain, so it shows "95.4 − 4.6" instead. `pct` is the same: "95%" or "95.4%".
 */
export function netParts(pct: number): { net: string; working: string; pct: string } {
  const exact = Math.round(2 * pct - 100);
  const whole = Math.round(pct);
  if (2 * whole - 100 === exact) {
    return { net: formatMargin(exact), working: `${whole} − ${100 - whole}`, pct: `${whole}%` };
  }
  const tenth = Math.round(pct * 10) / 10;
  return {
    net: formatMargin(exact),
    working: `${tenth.toFixed(1)} − ${(100 - tenth).toFixed(1)}`,
    pct: `${tenth.toFixed(1)}%`,
  };
}
